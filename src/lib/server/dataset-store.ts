import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NormalizedEntity, SourceId, ErlaubnisDetail } from '$lib/types';
import { getColumnsForSource, getColumnKeySet } from '$lib/server/sources/registry';

export type DatasetKind = SourceId;

export type DatasetSortKey = string | 'none';
export type DatasetSortDirection = 'asc' | 'desc';

export interface FilterOptionEntry {
	value: string;
	count: number;
}

export type FilterOptionsMap = Record<string, FilterOptionEntry[]>;

interface StoredDataset {
	entities: NormalizedEntity[];
	filterOptions: FilterOptionsMap;
	count: number;
}

export interface DatasetLoadProgress {
	requestId: string;
	kind: DatasetKind;
	status: 'running' | 'done' | 'error';
	percent: number;
	message: string;
	updatedAt: string;
}

const STORAGE_DIR = join(process.cwd(), '.data', 'uploads');
const LOAD_PROGRESS_TTL_MS = 5 * 60 * 1000;
const datasetLoadProgress = new Map<string, DatasetLoadProgress>();

const datasetCache = new Map<string, { stored: StoredDataset; accessedAt: number }>();
const MAX_CACHED_DATASETS = 3;

function formatErlaubnisEntry(e: ErlaubnisDetail): string {
	let line = e.text;
	const parts: string[] = [];
	if (e.startDate) parts.push(e.startDate);
	if (e.endDate) {
		parts.push(`→ ${e.endDate}`);
		if (e.endReason) parts.push(`(${e.endReason})`);
	}
	if (parts.length > 0) line += ` [${parts.join(' ')}]`;
	return line;
}

function formatErlaubnisseForDisplay(details: ErlaubnisDetail[]): string {
	return details.map(formatErlaubnisEntry).join('\n');
}

function formatErlaubnisseForCsv(details: ErlaubnisDetail[]): string {
	return details
		.map((e) => {
			const fields = [
				e.text,
				e.startDate || '',
				e.endDate || '',
				e.endReason || ''
			];
			return fields.join(' | ');
		})
		.join(' ; ');
}

function setDatasetLoadProgress(
	kind: DatasetKind,
	requestId: string,
	status: DatasetLoadProgress['status'],
	percent: number,
	message: string
): void {
	const next: DatasetLoadProgress = {
		requestId,
		kind,
		status,
		percent,
		message,
		updatedAt: new Date().toISOString()
	};
	const previous = datasetLoadProgress.get(requestId);
	datasetLoadProgress.set(requestId, next);

	if (!previous || previous.percent !== percent || previous.message !== message || previous.status !== status) {
		const logger = status === 'error' ? console.error : console.info;
		logger(`[${kind.toUpperCase()}][${requestId}] ${status} ${percent}% ${message}`);
	}

	if (status !== 'running') {
		setTimeout(() => {
			const current = datasetLoadProgress.get(requestId);
			if (current?.updatedAt === next.updatedAt) {
				datasetLoadProgress.delete(requestId);
			}
		}, LOAD_PROGRESS_TTL_MS);
	}
}

export function getDatasetLoadProgress(requestId: string): DatasetLoadProgress | null {
	return datasetLoadProgress.get(requestId) ?? null;
}

export function createDatasetProgressReporter(kind: DatasetKind, requestId?: string | null) {
	if (!requestId) return null;

	return {
		running(percent: number, message: string) {
			setDatasetLoadProgress(kind, requestId, 'running', percent, message);
		},
		done(percent: number, message: string) {
			setDatasetLoadProgress(kind, requestId, 'done', percent, message);
		},
		error(message: string) {
			setDatasetLoadProgress(kind, requestId, 'error', 100, message);
		}
	};
}

function getDatasetPath(kind: DatasetKind, datasetId: string): string {
	if (!datasetId.startsWith(`${kind}-`) || !/^[a-z]+-[0-9]+-[a-f0-9]+$/i.test(datasetId)) {
		throw new Error('Identifiant de dataset invalide');
	}

	return join(STORAGE_DIR, `${datasetId}.json`);
}

function getDatasetTimestamp(datasetId: string): number {
	const match = datasetId.match(/^[a-z]+-([0-9]+)-[a-f0-9]+$/i);
	return match ? Number(match[1]) : 0;
}


function buildFilterOptionsWithCounts(entities: NormalizedEntity[], keys: string[]): FilterOptionsMap {
	const result: FilterOptionsMap = {};
	for (const key of keys) {
		const countMap = new Map<string, number>();
		for (const entity of entities) {
			for (const value of getEntityValuesForKey(entity, key)) {
				if (value) countMap.set(value, (countMap.get(value) ?? 0) + 1);
			}
		}
		result[key] = Array.from(countMap.entries())
			.map(([value, count]) => ({ value, count }))
			.sort((a, b) => a.value.localeCompare(b.value, 'fr', { sensitivity: 'base' }));
	}
	return result;
}

export async function persistDataset(
	kind: DatasetKind,
	entities: NormalizedEntity[]
): Promise<{ datasetId: string; count: number }> {
	await mkdir(STORAGE_DIR, { recursive: true });

	const datasetId = `${kind}-${Date.now()}-${randomUUID().slice(0, 8)}`;
	const filePath = getDatasetPath(kind, datasetId);

	const sorted = [...entities].sort((a, b) => {
		const left = (a.siren || '').trim();
		const right = (b.siren || '').trim();
		return left.localeCompare(right, 'fr', { sensitivity: 'base' });
	});

	const columns = getColumnsForSource(kind);
	const filterOptionKeys = columns
		.filter((c) => c.filterType === 'select')
		.map((c) => c.key);

	const filterOptions = buildFilterOptionsWithCounts(sorted, filterOptionKeys);
	const stored: StoredDataset = { entities: sorted, filterOptions, count: sorted.length };
	await writeFile(filePath, JSON.stringify(stored), 'utf-8');

	return { datasetId, count: sorted.length };
}


function ensureFilterOptionsUpgraded(kind: DatasetKind, stored: StoredDataset): void {
	const columns = getColumnsForSource(kind);
	const selectKeys = columns.filter((c) => c.filterType === 'select').map((c) => c.key);
	for (const key of selectKeys) {
		const options = stored.filterOptions[key];
		if (!options || options.length === 0) continue;
		if (typeof (options[0] as unknown) === 'string') {
			stored.filterOptions[key] = buildFilterOptionsWithCounts(stored.entities, [key])[key] ?? [];
		}
	}
}

async function readDataset(
	kind: DatasetKind,
	datasetId: string,
	onProgress?: ReturnType<typeof createDatasetProgressReporter>
): Promise<StoredDataset> {
	const cached = datasetCache.get(datasetId);
	if (cached) {
		cached.accessedAt = Date.now();
			ensureFilterOptionsUpgraded(kind, cached.stored);
		onProgress?.running(56, `${cached.stored.entities.length} lignées depuis le cache.`);
		return cached.stored;
	}

	const filePath = getDatasetPath(kind, datasetId);
	onProgress?.running(18, `Lecture du fichier ${datasetId}...`);
	const content = await readFile(filePath, 'utf-8');
	onProgress?.running(42, `Analyse du JSON (${Math.round(content.length / 1024 / 1024)} Mo)...`);
	const parsed = JSON.parse(content);

	// Backward compat: old format was a plain array
	let stored: StoredDataset;
	if (Array.isArray(parsed)) {
		onProgress?.running(56, `${parsed.length} lignes chargées en mémoire.`);
		stored = { entities: parsed as NormalizedEntity[], filterOptions: {}, count: parsed.length };
	} else {
		stored = parsed as StoredDataset;
		if (!Array.isArray(stored.entities)) {
			throw new Error('Dataset corrompu');
		}
		onProgress?.running(56, `${stored.entities.length} lignes chargées en mémoire.`);
	}

		ensureFilterOptionsUpgraded(kind, stored);

	if (datasetCache.size >= MAX_CACHED_DATASETS) {
		let oldestKey = '';
		let oldestTime = Infinity;
		for (const [key, entry] of datasetCache) {
			if (entry.accessedAt < oldestTime) {
				oldestTime = entry.accessedAt;
				oldestKey = key;
			}
		}
		if (oldestKey) datasetCache.delete(oldestKey);
	}

	datasetCache.set(datasetId, { stored, accessedAt: Date.now() });
	return stored;
}

function getRoleCountryAndNamePairs(entity: NormalizedEntity): Array<{ country: string; role: string }> {
	const pairs: Array<{ country: string; role: string }> = [];
	for (const entry of entity.rolesByCountry ?? []) {
		if ('roles' in entry && Array.isArray(entry.roles)) {
			const country = String(entry.countryCode ?? '').trim();
			if (!country) continue;
			for (const role of entry.roles) {
				const normalizedRole = String(role ?? '').trim();
				if (normalizedRole) pairs.push({ country, role: normalizedRole });
			}
			continue;
		}

		for (const [country, roles] of Object.entries(entry)) {
			const normalizedCountry = String(country ?? '').trim();
			if (!normalizedCountry || !Array.isArray(roles)) continue;
			for (const role of roles) {
				const normalizedRole = String(role ?? '').trim();
				if (normalizedRole) pairs.push({ country: normalizedCountry, role: normalizedRole });
			}
		}
	}

	return pairs;
}

function getEntityValuesForKey(entity: NormalizedEntity, key: string): string[] {
	if (key === 'rolesSummary') {
		return Array.from(new Set(getRoleCountryAndNamePairs(entity).map((pair) => pair.role)));
	}

	if (key === 'rolesCountry') {
		return Array.from(new Set(getRoleCountryAndNamePairs(entity).map((pair) => pair.country)));
	}

	if (key === 'rolesName') {
		return Array.from(new Set(getRoleCountryAndNamePairs(entity).map((pair) => pair.role)));
	}

	if (key.startsWith('extra:')) {
		const extraKey = key.slice(6);
		const value = entity.extra?.[extraKey];
		return value ? [String(value)] : [];
	}

	if (key === 'erlaubnisseDetails') {
		const details = entity.erlaubnisseDetails;
		if (!details || details.length === 0) return [];
		return [formatErlaubnisseForDisplay(details)];
	}

	if (key === 'categorie') {
		const raw = String((entity as unknown as Record<string, unknown>)[key] ?? '').trim();
		if (!raw) return [];
		return raw
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}

	const value = String((entity as unknown as Record<string, unknown>)[key] ?? '').trim();
	return value ? [value] : [];
}

function matchesExcludeFilter(values: string[], exclude: string[]): boolean {
	if (exclude.length === 0) return true;
	const normalizedExclude = new Set(
		exclude.map((v) => v.trim().toLowerCase())
	);
	const normalizedValues = values.map((v) => v.trim().toLowerCase()).filter(Boolean);
	if (normalizedValues.length === 0) {
		// Hide empty values when any exclude filter is active,
		// unless user explicitly checked the __empty__ toggle
		// (which removes '' from the exclude list).
		return !normalizedExclude.has('');
	}
	// Show if at least one value is NOT excluded (OR logic for multi-value fields)
	return !normalizedValues.every((v) => normalizedExclude.has(v));
}
export async function getLatestDatasetId(kind: DatasetKind): Promise<string | null> {
	try {
		const files = await readdir(STORAGE_DIR);
		const latest = files
			.filter((file) => file.startsWith(`${kind}-`) && file.endsWith('.json'))
			.map((file) => file.replace(/\.json$/i, ''))
			.sort((a, b) => getDatasetTimestamp(b) - getDatasetTimestamp(a))[0];

		return latest || null;
	} catch {
		return null;
	}
}


function mergeFilterOptions(filtered: FilterOptionsMap, stored: FilterOptionsMap, keys: string[]): FilterOptionsMap {
	const result: FilterOptionsMap = {};
	for (const key of keys) {
		const filteredEntries = filtered[key] ?? [];
		const storedEntries = stored[key] ?? [];
		const storedMap = new Map(storedEntries.map((e) => [e.value, e.count]));
		const mergedMap = new Map<string, number>();
		// Start with filtered counts
		for (const entry of filteredEntries) {
			mergedMap.set(entry.value, entry.count);
		}
		// Add missing values from stored (count 0 — present in full dataset but not in filtered)
		for (const [value, count] of storedMap) {
			if (!mergedMap.has(value)) mergedMap.set(value, 0);
		}
		result[key] = Array.from(mergedMap.entries())
			.map(([value, count]) => ({ value, count }))
			.sort((a, b) => a.value.localeCompare(b.value, 'fr', { sensitivity: 'base' }));
	}
	return result;
}

export async function getDatasetPage(
	kind: DatasetKind,
	datasetId: string,
	params: {
		page: number;
		pageSize: number;
		textFilters: Record<string, string>;
		excludeFilters: Record<string, string[]>;
		sortKey: DatasetSortKey;
		sortDir: DatasetSortDirection;
		progressRequestId?: string | null;
	}
): Promise<{
	items: NormalizedEntity[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
	filterOptions: FilterOptionsMap;
}> {
	const progress = createDatasetProgressReporter(kind, params.progressRequestId);
	progress?.running(12, `Chargement du dataset ${datasetId}...`);
	const stored = await readDataset(kind, datasetId, progress);

	let filtered = stored.entities;
	progress?.running(64, 'Application des filtres texte...');

	const allowedKeys = getColumnKeySet(kind);
	let hasActiveFilters = false;

	for (const [rawKey, rawValue] of Object.entries(params.textFilters)) {
		if (!allowedKeys.has(rawKey)) continue;
		const query = (rawValue || '').trim().toLowerCase();
		if (!query) continue;
		hasActiveFilters = true;

		filtered = filtered.filter((entity) => {
			const values = getEntityValuesForKey(entity, rawKey).map((value) => value.toLowerCase());
			return values.some((value) => value.includes(query));
		});
	}


	const selectedCountries = params.excludeFilters['rolesCountry'] ?? [];
	const selectedRoles = params.excludeFilters['rolesSummary'] ?? [];
	if (selectedRoles.length === 0) {
		// Fallback to rolesName if rolesSummary not used
		const namesRoles = params.excludeFilters['rolesName'] ?? [];
		if (namesRoles.length > 0) selectedRoles.push(...namesRoles);
	}
	if (selectedCountries.length > 0 && selectedRoles.length > 0) {
		// Combined filter: entity must have the selected role(s) in the selected country(ies)
		filtered = filtered.filter((entity) => {
			const pairs = getRoleCountryAndNamePairs(entity);
			return pairs.some(
				(pair) =>
					matchesExcludeFilter([pair.country], selectedCountries) &&
					matchesExcludeFilter([pair.role], selectedRoles)
			);
		});
	} else {
		filtered = filtered.filter((entity) => {
			const countryValues = getEntityValuesForKey(entity, 'rolesCountry');
			const roleValues = getEntityValuesForKey(entity, 'rolesName');
			return matchesExcludeFilter(countryValues, selectedCountries) && matchesExcludeFilter(roleValues, selectedRoles);
		});
	}

	progress?.running(84, 'Application des filtres de sélection...');
	for (const [rawKey, rawValue] of Object.entries(params.excludeFilters)) {
		if (rawKey === 'rolesCountry' || rawKey === 'rolesName' || rawKey === 'rolesSummary') continue;
		if (!allowedKeys.has(rawKey)) continue;
		const selectedValues = rawValue || [];
		if (selectedValues.length === 0) continue;
		hasActiveFilters = true;

		filtered = filtered.filter((entity) => {
			const values = getEntityValuesForKey(entity, rawKey);
			return matchesExcludeFilter(values, selectedValues);
		});
	}
	progress?.running(76, 'Préparation des options de filtre...');
	let filterOptions: FilterOptionsMap;
	const selectOnlyKeys = new Set(getColumnsForSource(kind).filter((c) => c.filterType === 'select').map((c) => c.key));
	const filterKeys = Array.from(new Set(Object.keys(params.excludeFilters))).filter((k) => allowedKeys.has(k) && selectOnlyKeys.has(k));
	if (hasActiveFilters && Object.keys(stored.filterOptions).length > 0) {
		// Merge: filtered counts + all stored values so nothing disappears
		const filteredOptions = buildFilterOptionsWithCounts(filtered, filterKeys);
		filterOptions = mergeFilterOptions(filteredOptions, stored.filterOptions, filterKeys);
	} else if (Object.keys(stored.filterOptions).length > 0) {
		filterOptions = stored.filterOptions;
	} else {
		filterOptions = buildFilterOptionsWithCounts(stored.entities, filterKeys);
		Object.assign(stored.filterOptions, filterOptions);
	}

	progress?.running(92, 'Tri des résultats...');
	const isDefaultSort = params.sortKey === 'siren' && params.sortDir === 'asc';
	const sorted =
		params.sortKey === 'none' || (isDefaultSort && !hasActiveFilters && Object.keys(stored.filterOptions).length > 0)
			? filtered
			: [...filtered].sort((a, b) => {
				const sortKey = params.sortKey === 'none' ? 'siren' : params.sortKey;
				const left = getEntityValuesForKey(a, sortKey).join(' | ');
				const right = getEntityValuesForKey(b, sortKey).join(' | ');
				const result = left.localeCompare(right, 'fr', { sensitivity: 'base' });
				return params.sortDir === 'desc' ? -result : result;
			});

	const total = sorted.length;
	const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
	const safePage = Math.min(Math.max(1, params.page), totalPages);
	const start = (safePage - 1) * params.pageSize;
	const items = sorted.slice(start, start + params.pageSize);
	progress?.done(100, `Page ${safePage}/${totalPages} prête (${items.length} lignes affichées sur ${total}).`);

	return {
		items,
		total,
		page: safePage,
		pageSize: params.pageSize,
		totalPages,
		filterOptions
	};
}

export async function getLatestDatasetPage(
	kind: DatasetKind,
	params: {
		page: number;
		pageSize: number;
		textFilters: Record<string, string>;
		excludeFilters: Record<string, string[]>;
		sortKey: DatasetSortKey;
		sortDir: DatasetSortDirection;
		progressRequestId?: string | null;
	}
): Promise<{
	datasetId: string | null;
	items: NormalizedEntity[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
	filterOptions: FilterOptionsMap;
}> {
	const progress = createDatasetProgressReporter(kind, params.progressRequestId);
	progress?.running(5, 'Recherche du dernier dataset disponible...');
	const datasetId = await getLatestDatasetId(kind);

	if (!datasetId) {
		progress?.done(100, 'Aucun dataset disponible.');
		return {
			datasetId: null,
			items: [],
			total: 0,
			page: 1,
			pageSize: params.pageSize,
			totalPages: 1,
			filterOptions: {}
		};
	}

	progress?.running(10, `Dernier dataset trouvé: ${datasetId}`);
	const page = await getDatasetPage(kind, datasetId, params);
	return { datasetId, ...page };
}

export async function getFilteredEntities(
	kind: DatasetKind,
	datasetId: string,
	textFilters: Record<string, string>,
	excludeFilters: Record<string, string[]>,
	sortKey: DatasetSortKey,
	sortDir: DatasetSortDirection
): Promise<NormalizedEntity[]> {
	const stored = await readDataset(kind, datasetId);
	const allowedKeys = getColumnKeySet(kind);

	let filtered = stored.entities;
	let hasFilters = false;
	for (const [rawKey, rawValue] of Object.entries(textFilters)) {
		if (!allowedKeys.has(rawKey)) continue;
		const query = (rawValue || '').trim().toLowerCase();
		if (!query) continue;
		hasFilters = true;
		filtered = filtered.filter((entity) => {
			const values = getEntityValuesForKey(entity, rawKey).map((value) => value.toLowerCase());
			return values.some((value) => value.includes(query));
		});
	}

	const selectedCountries = excludeFilters['rolesCountry'] ?? [];
	const selectedRoles = excludeFilters['rolesSummary'] ?? [];
	if (selectedRoles.length === 0) {
		// Fallback to rolesName if rolesSummary not used
		const namesRoles = excludeFilters['rolesName'] ?? [];
		if (namesRoles.length > 0) selectedRoles.push(...namesRoles);
	}
	if (selectedCountries.length > 0 && selectedRoles.length > 0) {
		// Combined filter: entity must have the selected role(s) in the selected country(ies)
		hasFilters = true;
		filtered = filtered.filter((entity) => {
			const pairs = getRoleCountryAndNamePairs(entity);
			return pairs.some(
				(pair) =>
					matchesExcludeFilter([pair.country], selectedCountries) &&
					matchesExcludeFilter([pair.role], selectedRoles)
			);
		});
	} else if (selectedCountries.length > 0 || selectedRoles.length > 0) {
		hasFilters = true;
		filtered = filtered.filter((entity) => {
			const countryValues = getEntityValuesForKey(entity, 'rolesCountry');
			const roleValues = getEntityValuesForKey(entity, 'rolesName');
			return matchesExcludeFilter(countryValues, selectedCountries) && matchesExcludeFilter(roleValues, selectedRoles);
		});
	}

	for (const [rawKey, rawValue] of Object.entries(excludeFilters)) {
		if (rawKey === 'rolesCountry' || rawKey === 'rolesName' || rawKey === 'rolesSummary') continue;
		if (!allowedKeys.has(rawKey)) continue;
		const selectedValues = rawValue || [];
		if (selectedValues.length === 0) continue;
		hasFilters = true;
		filtered = filtered.filter((entity) => {
			const values = getEntityValuesForKey(entity, rawKey);
			return matchesExcludeFilter(values, selectedValues);
		});
	}

	const isDefaultSort = sortKey === 'siren' && sortDir === 'asc';
	if (sortKey !== 'none' && !(isDefaultSort && !hasFilters && Object.keys(stored.filterOptions).length > 0)) {
		filtered = [...filtered].sort((a, b) => {
			const left = getEntityValuesForKey(a, sortKey).join(' | ');
			const right = getEntityValuesForKey(b, sortKey).join(' | ');
			const result = left.localeCompare(right, 'fr', { sensitivity: 'base' });
			return sortDir === 'desc' ? -result : result;
		});
	}

	return filtered;
}

function escapeCsv(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}

export function entitiesToCsv(entities: NormalizedEntity[], columnKeys: string[], kind?: DatasetKind): string {
	const columns = kind ? getColumnsForSource(kind) : [];
	const labelMap: Record<string, string> = {};
	for (const col of columns) {
		labelMap[col.key] = col.label;
	}

	const labels = columnKeys.map((key) => labelMap[key] || key);
	const header = labels.map((label) => escapeCsv(label)).join(',');

	const rows = entities.map((entity) =>
		columnKeys
			.map((key) => {
				if (key === 'rolesSummary') {
					return entity.rolesSummary || '';
				}
				if (key === 'rolesCountry' || key === 'rolesName') return '';
				if (key === 'erlaubnisseDetails') {
					const details = entity.erlaubnisseDetails;
					return details && details.length > 0 ? formatErlaubnisseForCsv(details) : '';
				}
				if (key.startsWith('extra:')) {
					const extraKey = key.slice(6);
					const value = entity.extra?.[extraKey];
					return value === null || value === undefined ? '' : String(value);
				}
				const raw = (entity as unknown as Record<string, unknown>)[key];
				return raw === null || raw === undefined ? '' : String(raw);
			})
			.map((value) => escapeCsv(value))
			.join(',')
	);

	return [header, ...rows].join('\n');
}
