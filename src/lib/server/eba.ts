import type { NormalizedEntity } from '$lib/types';
import { extractJsonObjects } from './stream-json';

function normalizeCountryCode(country: string | null): string {
	if (!country) return 'UNK';
	const normalized = country.trim().toUpperCase();
	if (!normalized) return 'UNK';
	if (normalized === 'FRANCE' || normalized === 'FRA') return 'FR';
	return normalized;
}

/**
 * Extract the comparable ID from an ENT_NAT_REF_COD value.
 * German credit institutions use the format "8410551/BAKNR:105658"
 * where the actual BaFin BAK NR is the part after the last colon.
 * Plain numbers like "1629387" pass through unchanged.
 */
function normalizeSiren(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return '';

	const colonIndex = trimmed.lastIndexOf(':');
	if (colonIndex >= 0) {
		const afterColon = trimmed.slice(colonIndex + 1).replace(/\D/g, '');
		if (afterColon) return afterColon;
	}

	return trimmed;
}

const PSD2_SERVICE_LABELS: Record<string, string> = {
	PS_010: 'Cash placement',
	PS_020: 'Cash withdrawals',
	'PS_03A': 'Direct debits',
	'PS_03B': 'Payment cards',
	'PS_03C': 'Credit transfers',
	'PS_03D': 'Payment transactions',
	'PS_03E': 'Credit transfers (other)',
	PS_040: 'Issuing instruments',
	PS_050: 'Acquiring transactions',
	PS_060: 'Money remittance',
	PS_070: 'Payment initiation (PISP)',
	PS_080: 'Account information (AISP)',
};

function mapRoleCodeToLabel(code: string): string {
	const direct = PSD2_SERVICE_LABELS[code];
	if (direct) return direct;

	const upper = code.toUpperCase();
	const upperDirect = PSD2_SERVICE_LABELS[upper];
	if (upperDirect) return upperDirect;

	if (upper === 'PSP_070' || upper === 'PSP_AI') return 'Payment initiation (PISP)';
	if (upper === 'PSP_080' || upper === 'PSP_PI') return 'Account information (AISP)';

	return '';
}

function extractRoleCodes(value: unknown): string[] {
	if (value == null) return [];

	if (typeof value === 'number') {
		const code = String(value);
		if (code === '7') return ['PS_070'];
		if (code === '8') return ['PS_080'];
		return [];
	}

	if (typeof value === 'string') {
		const upper = value.toUpperCase();
		const roles = new Set<string>();

		// Match known PSD2 service codes: PS_xxx, PSP_xxx — return raw codes
		const matches = upper.match(/\b(PS_\d{2}[A-Z]?|PSP_[A-Z]{2,})\b/g);
		if (matches) {
			for (const m of matches) {
				roles.add(m);
			}
		}

		// Fallback for embedded codes (e.g. inside longer strings)
		if (roles.size === 0) {
			for (const code of Object.keys(PSD2_SERVICE_LABELS)) {
				if (upper.includes(code.toUpperCase())) {
					roles.add(code);
				}
			}
			if (upper.includes('PSP_070') || upper.includes('PSP_AI')) roles.add('PSP_AI');
			if (upper.includes('PSP_080') || upper.includes('PSP_PI')) roles.add('PSP_PI');
		}

		return Array.from(roles);
	}

	if (Array.isArray(value)) {
		return Array.from(new Set(value.flatMap((item) => extractRoleCodes(item))));
	}

	if (typeof value === 'object') {
		return Array.from(new Set(Object.values(value).flatMap((item) => extractRoleCodes(item))));
	}

	return [];
}

function extractRolesFromProperties(props: Record<string, string>): string[] {
	const codes = new Set<string>();
	for (const [key, value] of Object.entries(props)) {
		const normalizedKey = key.toUpperCase();
		if (
			!normalizedKey.includes('ROL') &&
			!normalizedKey.includes('PSD') &&
			!normalizedKey.includes('SERV') &&
			!normalizedKey.includes('AUTH')
		)
			continue;
		for (const code of extractRoleCodes(value)) {
			codes.add(code);
		}
	}
	return Array.from(codes).sort((a, b) => a.localeCompare(b, 'fr'));
}

function isRoleContextKey(key: string): boolean {
	const normalized = key.toUpperCase();
	return (
		normalized.includes('ROL') ||
		normalized.includes('ROLE') ||
		normalized.includes('SERV') ||
		normalized.includes('PSD') ||
		normalized.includes('PAYMENT') ||
		normalized.includes('AUTH')
	);
}

function readCountryField(record: Record<string, unknown>, fallbackCountry: string | null): string | null {
	const countryKeys = [
		'country',
		'Country',
		'countryCode',
		'CountryCode',
		'hostCountry',
		'HostCountry',
		'hostCountryCode',
		'HostCountryCode',
		'pays',
		'Pays',
		'countryISO',
		'CountryISO'
	] as const;

	for (const key of countryKeys) {
		const value = record[key];
		if (typeof value === 'string' && value.trim()) {
			return value;
		}
	}

	return fallbackCountry;
}

function extractRolesByCountryFromUnknown(
	value: unknown,
	fallbackCountry: string | null,
	keyHint = '',
	inRoleContext = false
): Array<{ country: string | null; roleCodes: string[] }> {
	if (value == null) return [];

	if (typeof value === 'number' || typeof value === 'string') {
		const allow = inRoleContext || isRoleContextKey(keyHint);
		if (!allow) return [];
		const roleCodes = extractRoleCodes(value);
		return roleCodes.length > 0 ? [{ country: fallbackCountry, roleCodes }] : [];
	}

	if (Array.isArray(value)) {
		const collected: Array<{ country: string | null; roleCodes: string[] }> = [];
		for (const item of value) {
			collected.push(...extractRolesByCountryFromUnknown(item, fallbackCountry, keyHint, inRoleContext));
		}
		return collected;
	}

	if (typeof value === 'object') {
		const record = value as Record<string, unknown>;
		const country = readCountryField(record, fallbackCountry);
		const rows: Array<{ country: string | null; roleCodes: string[] }> = [];

		for (const [key, nestedValue] of Object.entries(record)) {
			const childRoleContext = inRoleContext || isRoleContextKey(key);
			rows.push(...extractRolesByCountryFromUnknown(nestedValue, country, key, childRoleContext));
		}

		return rows;
	}

	return [];
}

function extractRolesByCountry(
	raw: Record<string, unknown>,
	props: Record<string, string>,
	propsRaw: Record<string, unknown>,
	defaultCountry: string | null
) {
	const byCountry = new Map<string, Set<string>>();

	const addRoles = (country: string | null, roles: string[]) => {
		if (roles.length === 0) return;
		const code = normalizeCountryCode(country);
		if (!byCountry.has(code)) byCountry.set(code, new Set<string>());
		const bucket = byCountry.get(code)!;
		for (const role of roles) {
			bucket.add(role);
		}
	};

	addRoles(defaultCountry, extractRolesFromProperties(props));

	for (const [key, value] of Object.entries(propsRaw)) {
		if (!isRoleContextKey(key)) continue;
		for (const row of extractRolesByCountryFromUnknown(value, defaultCountry, key, true)) {
			addRoles(row.country, row.roleCodes);
		}
	}

	const authorisationsCandidates = [raw.authorisations, raw.Authorisations, raw.authorizations, raw.Authorizations];
	const servicesCandidates = [raw.Services, raw.services];
	const sourceCandidates = [...authorisationsCandidates, ...servicesCandidates];
	for (const candidate of sourceCandidates) {
		if (candidate == null) continue;

		if (Array.isArray(candidate)) {
			for (const item of candidate) {
				if (!item || typeof item !== 'object') {
					addRoles(defaultCountry, extractRoleCodes(item));
					continue;
				}

				const row = item as Record<string, unknown>;
				let country =
					typeof row.country === 'string'
						? row.country
						: typeof row.Country === 'string'
							? row.Country
							: typeof row.countryCode === 'string'
								? row.countryCode
								: typeof row.CountryCode === 'string'
									? row.CountryCode
									: defaultCountry;

				if (country === defaultCountry) {
					for (const [key, value] of Object.entries(row)) {
						if (/^[A-Z]{2}$/.test(key) && (Array.isArray(value) || typeof value === 'string')) {
							addRoles(key, extractRoleCodes(value));
						}
					}
				}

				const rowRoleCodes = new Set<string>();
				for (const value of Object.values(row)) {
					for (const code of extractRoleCodes(value)) {
						rowRoleCodes.add(code);
					}
				}

				addRoles(country, Array.from(rowRoleCodes));
			}
			continue;
		}

		addRoles(defaultCountry, extractRoleCodes(candidate));
	}

	return Array.from(byCountry.entries())
		.map(([countryCode, roleCodes]) => {
			const normalizedCountry = normalizeCountryCode(countryCode);
			const mappedRoles = Array.from(roleCodes)
				.map(mapRoleCodeToLabel)
				.filter(Boolean)
				.sort((a, b) => a.localeCompare(b, 'fr'));
			return { [normalizedCountry]: mappedRoles };
		})
		.filter((entry) => {
			const firstValue = Object.values(entry)[0];
			return Array.isArray(firstValue) && firstValue.length > 0;
		})
		.sort((a, b) => Object.keys(a)[0].localeCompare(Object.keys(b)[0]));
}

function summarizeRoles(rolesByCountry: Array<Record<string, string[]>>): string {
	const uniqueRoles = Array.from(
		new Set(rolesByCountry.flatMap((entry) => Object.values(entry).flatMap((roles) => roles)).filter(Boolean))
	).sort((a, b) =>
		a.localeCompare(b, 'fr')
	);
	if (uniqueRoles.length === 0) return '';
	const visible = uniqueRoles.slice(0, 3);
	const hidden = uniqueRoles.length - visible.length;
	return hidden > 0 ? `${visible.join(', ')} +${hidden}` : visible.join(', ');
}

function normalizePropertyValue(value: unknown): string {
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);

	if (Array.isArray(value)) {
		return value
			.map((item) => {
				if (typeof item === 'string') return item.trim();
				if (typeof item === 'number' || typeof item === 'boolean') return String(item);
				return '';
			})
			.filter(Boolean)
			.join(' ')
			.trim();
	}

	return '';
}

function extractProperties(raw: Record<string, unknown>): Record<string, string> {
	const props: Record<string, string> = {};

	if (!Array.isArray(raw.Properties)) return props;

	for (const item of raw.Properties) {
		if (!item || typeof item !== 'object') continue;

		// Shape 1: { PropertyCode: 'ENT_NAM', PropertyValue: '...' }
		const code = 'PropertyCode' in item ? item.PropertyCode : undefined;
		if (typeof code === 'string') {
			const value = normalizePropertyValue('PropertyValue' in item ? item.PropertyValue : undefined);
			if (value) props[code] = value;
			continue;
		}

		// Shape 2: { ENT_NAM: '...' } or { ENT_ADD: ['line1', 'line2'] }
		for (const [key, value] of Object.entries(item)) {
			const normalized = normalizePropertyValue(value);
			if (normalized) props[key] = normalized;
		}
	}

	return props;
}

function extractPropertiesRaw(raw: Record<string, unknown>): Record<string, unknown> {
	const props: Record<string, unknown> = {};

	if (!Array.isArray(raw.Properties)) return props;

	for (const item of raw.Properties) {
		if (!item || typeof item !== 'object') continue;

		const row = item as Record<string, unknown>;
		const code = typeof row.PropertyCode === 'string' ? row.PropertyCode : null;

		if (code) {
			props[code] = row.PropertyValue;
			continue;
		}

		for (const [key, value] of Object.entries(row)) {
			props[key] = value;
		}
	}

	return props;
}

function pickFirstNonEmpty(props: Record<string, string>, keys: string[]): string | null {
	for (const key of keys) {
		const value = props[key]?.trim();
		if (value) return value;
	}
	return null;
}

function extractCountry(props: Record<string, string>): string | null {
	// EBA payloads can expose country with different property codes depending on the feed version.
	return pickFirstNonEmpty(props, [
		'ENT_COU_RES',
		'ENT_COU_COD_RES',
		'ENT_COU_NAM_RES',
		'ENT_COU',
		'COU_RES',
		'COUNTRY',
		'COUNTRY_CODE'
	]);
}

function buildPropsFromRaw(raw: Record<string, unknown>): { props: Record<string, string>; propsRaw: Record<string, unknown> } {
	const props: Record<string, string> = {};
	const propsRaw: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (typeof value === 'string') {
			props[key] = value;
		}
		propsRaw[key] = value;
	}
	return { props, propsRaw };
}


function formatEntAutDates(dates: unknown): { formatted: string; expired: boolean } {
	if (!Array.isArray(dates) || dates.length === 0) {
		return { formatted: '', expired: false };
	}

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const parts: string[] = [];
	let hasActivePeriod = false;

	// Process pairs: even indices (0,2,4...) = start, odd indices (1,3,5...) = expiry
	for (let j = 0; j < dates.length; j += 2) {
		const start = typeof dates[j] === 'string' ? dates[j].trim() : '';
		const end = j + 1 < dates.length && typeof dates[j + 1] === 'string' ? dates[j + 1].trim() : null;

		if (!start) continue;

		if (end) {
			parts.push(start + ' – ' + end);
			const endDate = new Date(end);
			endDate.setHours(0, 0, 0, 0);
			if (endDate >= today) {
				hasActivePeriod = true;
			}
		} else {
			parts.push(start + ' – present');
			hasActivePeriod = true;
		}
	}

	return {
		formatted: parts.join('; '),
		expired: parts.length > 0 && !hasActivePeriod
	};
}
function normalizeEbaEntity(raw: Record<string, unknown>): NormalizedEntity | null {
	const companyId = raw['company_id'];
	if (companyId && typeof companyId === 'string' && companyId.trim()) {
		const activity = raw['activity'];
		let categorie: string | null = null;
		if (Array.isArray(activity)) {
			categorie = activity.filter((a): a is string => typeof a === 'string' && a.length > 0).join(', ');
		} else if (typeof activity === 'string' && activity.trim()) {
			categorie = activity.trim();
		}

		// Try to extract roles from the flat shape too (Services, authorisations, etc.)
		const flatCountry = raw['country'] ? String(raw['country']).trim() : null;
		const { props: flatProps, propsRaw: flatPropsRaw } = buildPropsFromRaw(raw);
		const flatRolesByCountry = extractRolesByCountry(raw, flatProps, flatPropsRaw, flatCountry);

		return {
			siren: normalizeSiren(companyId),
			denomination: raw['denomination'] ? String(raw['denomination']).trim() : '',
			ville: raw['ville'] ? String(raw['ville']).trim() : null,
			pays: flatCountry,
			categorie,
			lei: raw['lei'] ? String(raw['lei']).trim() : null,
			idReferentiel: raw['reference_id'] ? String(raw['reference_id']).trim() : undefined,
			cib: raw['cib'] ? String(raw['cib']).trim() : null,
			entityType: raw['entity_type'] ? String(raw['entity_type']).trim() : null,
			source: 'eba',
			rolesByCountry: flatRolesByCountry,
			rolesSummary: summarizeRoles(flatRolesByCountry)
		};
	}

	const props = extractProperties(raw);
	const propsRaw = extractPropertiesRaw(raw);
	const country = extractCountry(props);

	const siren = normalizeSiren(props['ENT_NAT_REF_COD'] || '');
	if (!siren) return null;
	const rolesByCountry = extractRolesByCountry(raw, props, propsRaw, country || 'FRANCE');


		// Extract ENT_AUT authorization dates
		const entAutRaw = propsRaw['ENT_AUT'];
		const { formatted: entAutFormatted, expired: entAutExpired } = formatEntAutDates(entAutRaw);
		const extra: Record<string, string | null> = {};
		if (entAutFormatted) {
			extra.entAut = entAutFormatted;
			extra.entAutStatus = entAutExpired ? 'Expired' : 'Active';
		}
	return {
		siren,
		denomination: props['ENT_NAM'] || '',
		ville: props['ENT_TOW_CIT_RES'] || null,
		pays: country || 'FRANCE',
		categorie: mapEbaTypeToCategory(String(raw.EntityType || '')),
		lei: null,
		entityCode: raw.EntityCode ? String(raw.EntityCode) : undefined,
		source: 'eba',
		rolesByCountry,
		rolesSummary: summarizeRoles(rolesByCountry),
			extra: Object.keys(extra).length > 0 ? extra : undefined,
	};
}

export function parseEbaPayload(payload: unknown): NormalizedEntity[] {
	const entities: NormalizedEntity[] = [];
	const stack: unknown[] = [payload];

	while (stack.length > 0) {
		const current = stack.pop();

		if (Array.isArray(current)) {
			for (let i = current.length - 1; i >= 0; i--) {
				stack.push(current[i]);
			}
			continue;
		}

		if (!current || typeof current !== 'object') continue;

		const obj = current as Record<string, unknown>;
		const entity = normalizeEbaEntity(obj);
		if (entity) entities.push(entity);

		for (const value of Object.values(obj)) {
			if (value && typeof value === 'object') {
				stack.push(value);
			}
		}
	}

	return entities;
}

export async function parseEbaStream(webStream: ReadableStream): Promise<NormalizedEntity[]> {
	const entities: NormalizedEntity[] = [];
	for await (const raw of extractJsonObjects(webStream)) {
		const entity = normalizeEbaEntity(raw);
		if (entity) entities.push(entity);
 	}

	return entities;
}

function mapEbaTypeToCategory(entityType: string): string {
	return entityType;
}
