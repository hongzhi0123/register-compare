import type { NormalizedEntity } from '$lib/types';
import { extractJsonObjects } from './stream-json';

function normalizeCountryCode(country: string | null): string {
	if (!country) return 'UNK';
	const normalized = country.trim().toUpperCase();
	if (!normalized) return 'UNK';
	if (normalized === 'FRANCE' || normalized === 'FRA') return 'FR';
	return normalized;
}

function mapRoleCodeToLabel(code: string): string {
	if (code === 'PS_070' || code === 'PSP_070' || code === 'PSP_AI') return 'PSP_AI';
	if (code === 'PS_080' || code === 'PSP_080' || code === 'PSP_PI') return 'PSP_PI';
	return '';
}

function extractRoleCodes(value: unknown): string[] {
	if (value == null) return [];

	if (typeof value === 'number') {
		const code = String(value);
		if (code === '7') return ['PSP_AI'];
		if (code === '8') return ['PSP_PI'];
		return [];
	}

	if (typeof value === 'string') {
		const upper = value.toUpperCase();
		const roles = new Set<string>();
		if (upper.includes('PS_070') || upper.includes('PSP_070') || upper.includes('PSP_AI')) roles.add('PSP_AI');
		if (upper.includes('PS_080') || upper.includes('PSP_080') || upper.includes('PSP_PI')) roles.add('PSP_PI');
		if (roles.size > 0) {
			return Array.from(roles);
		}

		return [];
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

function isFrenchCountry(country: string | null): boolean {
	if (!country) return false;
	const normalized = country.trim().toUpperCase();
	return normalized === 'FRANCE' || normalized === 'FR' || normalized === 'FRA';
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

		return {
			siren: companyId.trim(),
			denomination: raw['denomination'] ? String(raw['denomination']).trim() : '',
			ville: raw['ville'] ? String(raw['ville']).trim() : null,
			pays: raw['country'] ? String(raw['country']).trim() : null,
			categorie,
			lei: raw['lei'] ? String(raw['lei']).trim() : null,
			idReferentiel: raw['reference_id'] ? String(raw['reference_id']).trim() : undefined,
			cib: raw['cib'] ? String(raw['cib']).trim() : null,
			entityType: raw['entity_type'] ? String(raw['entity_type']).trim() : null,
			source: 'eba',
			rolesByCountry: [],
			rolesSummary: ''
		};
	}

	if (raw.CA_OwnerID !== 'FR_ACPR') return null;

	const props = extractProperties(raw);
	const propsRaw = extractPropertiesRaw(raw);
	const country = extractCountry(props);
	if (country && !isFrenchCountry(country)) return null;

	const siren = props['ENT_NAT_REF_COD'] || '';
	if (!siren) return null;
	const rolesByCountry = extractRolesByCountry(raw, props, propsRaw, country || 'FRANCE');

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
		rolesSummary: summarizeRoles(rolesByCountry)
	};
}

export function parseEbaPayload(payload: unknown): NormalizedEntity[] {
	const french: NormalizedEntity[] = [];
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
		if (entity) french.push(entity);

		for (const value of Object.values(obj)) {
			if (value && typeof value === 'object') {
				stack.push(value);
			}
		}
	}

	return french;
}

export async function parseEbaStream(webStream: ReadableStream): Promise<NormalizedEntity[]> {
	const french: NormalizedEntity[] = [];
	for await (const raw of extractJsonObjects(webStream)) {
		const entity = normalizeEbaEntity(raw);
		if (entity) french.push(entity);
 	}

	return french;
}

function mapEbaTypeToCategory(entityType: string): string {
	switch (entityType) {
		case 'PSD_PI':
			return 'Établissement de Paiement';
		case 'PSD_EMI':
			return 'Établissement de Monnaie Électronique';
		case 'PSD_AISP':
			return 'Prestataire de services d\'informations sur les comptes (PSIC)';
		case 'PSD_AGENT':
			return 'Agent PSP';
		case 'PSD_EXEMPTED_PI':
			return 'Autres prestataires de services de paiement';
		case 'PSD_EXEMPTED_EMI':
			return 'Établissement de Monnaie Électronique (exempté)';
		case 'PSD_EXCLUDED_PSP':
			return 'Prestataire exclu';
		case 'PSD_BRANCH':
			return 'Succursale';
		default:
			return entityType;
	}
}
