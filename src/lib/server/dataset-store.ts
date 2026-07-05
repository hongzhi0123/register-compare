import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NormalizedEntity } from '$lib/types';

export type DatasetKind = 'eba' | 'regafi';
export type DatasetColumnKey =
	| 'siren'
	| 'denomination'
	| 'ville'
	| 'pays'
	| 'categorie'
	| 'entityCode'
	| 'lei'
	| 'idReferentiel';
export type DatasetSortKey = DatasetColumnKey | 'none';
export type DatasetSortDirection = 'asc' | 'desc';

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

function createDatasetProgressReporter(kind: DatasetKind, requestId?: string | null) {
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

export async function persistDataset(
	kind: DatasetKind,
	entities: NormalizedEntity[]
): Promise<{ datasetId: string; count: number }> {
	await mkdir(STORAGE_DIR, { recursive: true });

	const datasetId = `${kind}-${Date.now()}-${randomUUID().slice(0, 8)}`;
	const filePath = getDatasetPath(kind, datasetId);

	await writeFile(filePath, JSON.stringify(entities), 'utf-8');

	return {
		datasetId,
		count: entities.length
	};
}

async function readDataset(
	kind: DatasetKind,
	datasetId: string,
	onProgress?: ReturnType<typeof createDatasetProgressReporter>
): Promise<NormalizedEntity[]> {
	const filePath = getDatasetPath(kind, datasetId);
	onProgress?.running(18, `Lecture du fichier ${datasetId}...`);
	const content = await readFile(filePath, 'utf-8');
	onProgress?.running(42, `Analyse du JSON (${Math.round(content.length / 1024 / 1024)} Mo)...`);
	const parsed = JSON.parse(content);

	if (!Array.isArray(parsed)) {
		throw new Error('Dataset corrompu');
	}

	onProgress?.running(56, `${parsed.length} lignes chargées en mémoire.`);

	return parsed as NormalizedEntity[];
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

export async function getDatasetPage(
	kind: DatasetKind,
	datasetId: string,
	params: {
		page: number;
		pageSize: number;
		textFilters: Partial<Record<DatasetColumnKey, string>>;
		selectFilters: Partial<Record<DatasetColumnKey, string[]>>;
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
	filterOptions: Partial<Record<DatasetColumnKey, string[]>>;
}> {
	const progress = createDatasetProgressReporter(kind, params.progressRequestId);
	progress?.running(12, `Chargement du dataset ${datasetId}...`);
	const entities = await readDataset(kind, datasetId, progress);

	let filtered = entities;
	progress?.running(64, 'Application des filtres texte...');

	for (const [rawKey, rawValue] of Object.entries(params.textFilters)) {
		const key = rawKey as DatasetColumnKey;
		const query = (rawValue || '').trim().toLowerCase();
		if (!query) continue;

		filtered = filtered.filter((entity) => {
			const value = String(entity[key] ?? '').toLowerCase();
			return value.includes(query);
		});
	}

	progress?.running(76, 'Préparation des options de filtre...');
	const filterOptions: Partial<Record<DatasetColumnKey, string[]>> = {};
	for (const [rawKey] of Object.entries(params.selectFilters)) {
		const key = rawKey as DatasetColumnKey;

		const values = new Set<string>();
		for (const entity of filtered) {
			const value = String(entity[key] ?? '').trim();
			if (value) values.add(value);
		}
		filterOptions[key] = Array.from(values).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
	}

	progress?.running(84, 'Application des filtres de sélection...');
	for (const [rawKey, rawValue] of Object.entries(params.selectFilters)) {
		const key = rawKey as DatasetColumnKey;
		const selectedValues = (rawValue || []).map((value) => value.trim().toLowerCase()).filter(Boolean);
		if (selectedValues.length === 0 || selectedValues.includes('__all__')) continue;

		const hasEmpty = selectedValues.includes('__empty__');
		const hasNonEmpty = selectedValues.includes('__non_empty__');
		const exactValues = selectedValues.filter((value) => value !== '__empty__' && value !== '__non_empty__');

		filtered = filtered.filter((entity) => {
			const value = String(entity[key] ?? '').trim().toLowerCase();
			if (exactValues.includes(value)) return true;
			if (value === '') return hasEmpty;
			if (value !== '' && hasNonEmpty) return true;
			return false;
		});
	}

	progress?.running(92, 'Tri des résultats...');
	const sorted =
		params.sortKey === 'none'
			? filtered
			: [...filtered].sort((a, b) => {
				const sortKey = params.sortKey === 'none' ? 'siren' : params.sortKey;
				const left = String(a[sortKey] || '');
				const right = String(b[sortKey] || '');
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
		textFilters: Partial<Record<DatasetColumnKey, string>>;
		selectFilters: Partial<Record<DatasetColumnKey, string[]>>;
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
	filterOptions: Partial<Record<DatasetColumnKey, string[]>>;
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