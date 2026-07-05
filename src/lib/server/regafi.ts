import type { RegafiRecord, NormalizedEntity } from '$lib/types';

const PSD2_ROLE_LABELS: Record<string, string> = {
	'1': 'Versement d\'espèces sur un compte de paiement',
	'2': 'Retrait d\'espèces sur un compte de paiement',
	'3': 'Exécution d\'opérations de paiement',
	'4': 'Exécution d\'opérations de paiement avec crédit',
	'5': 'Émission d\'instruments de paiement',
	'6': 'Transmission de fonds',
	'7': 'Initiation de paiement',
	'8': 'Information sur les comptes'
};

const REGAFI_BASE = 'https://developer.regafi.banque-france.fr/api/explore/v2.1';
const DATASET = 'catalogue-banque';

function normalizeCountryName(country: string | null): string {
	if (!country) return 'Pays inconnu';
	const normalized = country.trim();
	if (!normalized) return 'Pays inconnu';
	if (isFrenchCountry(normalized)) return 'France';
	return normalized;
}

function normalizeCountryCode(country: string | null): string {
	if (!country) return 'UNK';
	const normalized = country.trim().toUpperCase();
	if (!normalized) return 'UNK';
	if (normalized === 'FRANCE' || normalized === 'FRA') return 'FR';
	return normalized;
}

function mapRoleCodeToLabel(code: string): string {
	return PSD2_ROLE_LABELS[code] ?? `Service PSD2 ${code}`;
}

function extractRoleCodes(value: unknown): string[] {
	if (value == null) return [];

	if (typeof value === 'number') {
		const code = String(value);
		return /^\d+$/.test(code) ? [code] : [];
	}

	if (typeof value === 'string') {
		const matches = value.match(/\b([1-8])\b/g);
		return matches ? Array.from(new Set(matches)) : [];
	}

	if (Array.isArray(value)) {
		return Array.from(new Set(value.flatMap((item) => extractRoleCodes(item))));
	}

	if (typeof value === 'object') {
		return Array.from(new Set(Object.values(value).flatMap((item) => extractRoleCodes(item))));
	}

	return [];
}

function tryParseJson(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function extractRegafiRolesByCountry(authorisations: unknown, defaultCountry: string | null) {
	const parsed = typeof authorisations === 'string' ? tryParseJson(authorisations) : authorisations;
	const byCountry = new Map<string, Set<string>>();

	const addRoles = (country: string | null, roleCodes: string[]) => {
		if (roleCodes.length === 0) return;
		const countryCode = normalizeCountryCode(country);
		if (!byCountry.has(countryCode)) byCountry.set(countryCode, new Set<string>());
		const bucket = byCountry.get(countryCode)!;
		for (const roleCode of roleCodes) {
			bucket.add(roleCode);
		}
	};

	if (Array.isArray(parsed)) {
		for (const item of parsed) {
			if (!item || typeof item !== 'object') {
				addRoles(defaultCountry, extractRoleCodes(item));
				continue;
			}

			const row = item as Record<string, unknown>;
			const country =
				typeof row.pays === 'string'
					? row.pays
					: typeof row.country === 'string'
						? row.country
						: typeof row.Country === 'string'
							? row.Country
							: defaultCountry;
			const rowRoleCodes = new Set<string>();
			for (const value of Object.values(row)) {
				for (const code of extractRoleCodes(value)) {
					rowRoleCodes.add(code);
				}
			}

			addRoles(country, Array.from(rowRoleCodes));
		}
	} else if (parsed && typeof parsed === 'object') {
		const roleCodes = extractRoleCodes(parsed);
		addRoles(defaultCountry, roleCodes);
	} else {
		addRoles(defaultCountry, extractRoleCodes(parsed));
	}

	return Array.from(byCountry.entries())
		.map(([countryCode, roleCodes]) => ({
			countryCode,
			countryName: normalizeCountryName(countryCode),
			roles: Array.from(roleCodes)
				.sort((a, b) => Number(a) - Number(b))
				.map(mapRoleCodeToLabel)
		}))
		.sort((a, b) => a.countryCode.localeCompare(b.countryCode));
}

function summarizeRoles(rolesByCountry: Array<{ roles: string[] }>): string {
	const uniqueRoles = Array.from(new Set(rolesByCountry.flatMap((entry) => entry.roles).filter(Boolean))).sort((a, b) =>
		a.localeCompare(b, 'fr')
	);
	if (uniqueRoles.length === 0) return '';
	const visible = uniqueRoles.slice(0, 3);
	const hidden = uniqueRoles.length - visible.length;
	return hidden > 0 ? `${visible.join(', ')} +${hidden}` : visible.join(', ');
}

export async function fetchRegafiEntities(apiKey?: string): Promise<NormalizedEntity[]> {
	const allResults: RegafiRecord[] = [];
	let offset = 0;
	const limit = 100;

	while (true) {
		const params = new URLSearchParams({
			where: "pays='FRANCE'",
			limit: String(limit),
			offset: String(offset)
		});
		if (apiKey) {
			params.set('apikey', apiKey);
		}

		const url = `${REGAFI_BASE}/catalog/datasets/${DATASET}/records?${params}`;
		const response = await fetch(url);

		if (!response.ok) {
			throw new Error(`REGAFI API error (${response.status}): ${await response.text()}`);
		}

		const data = await response.json();
		const records: RegafiRecord[] = data.results || [];

		if (records.length === 0) break;

		allResults.push(...records);
		offset += limit;

		if (records.length < limit) break;
	}

	return allResults.map(normalizeRegafiEntity);
}

export function parseRegafiJson(json: string): NormalizedEntity[] {
  const data = JSON.parse(json);
  const records: unknown[] = data.results || (Array.isArray(data) ? data : []);

  if (records.length === 0) return [];

  const first = records[0] as Record<string, unknown>;
  if (first.fields && typeof first.fields === 'object') {
		return keepFrenchEntities((records as RegafiRecord[]).map(normalizeRegafiEntity));
  } else {
		return keepFrenchEntities(records.map((r) => normalizeFlatEntity(r as Record<string, unknown>)));
  }
}

function isFrenchCountry(value: string | null): boolean {
	if (!value) return false;
	const normalized = value.trim().toUpperCase();
	return normalized === 'FRANCE' || normalized === 'FR' || normalized === 'FRA';
}

export function keepFrenchEntities(entities: NormalizedEntity[]): NormalizedEntity[] {
	return entities.filter((entity) => isFrenchCountry(entity.pays));
}

export function normalizeRegafiEntity(record: RegafiRecord): NormalizedEntity {
	const f = record.fields;
	const rolesByCountry = extractRegafiRolesByCountry(f?.authorisations, f?.pays || null);
	return {
		siren: f?.siren || '',
		denomination: f?.denomination || '(sans nom)',
		ville: f?.ville || null,
		pays: f?.pays || null,
		categorie: f?.categorie || null,
		lei: f?.lei || null,
		idReferentiel: f?.id_referentiel,
		source: 'regafi',
		authorisations: f?.authorisations ? JSON.stringify(f.authorisations) : null,
		rolesByCountry,
		rolesSummary: summarizeRoles(rolesByCountry)
	};
}

export function normalizeFlatEntity(record: Record<string, unknown>): NormalizedEntity {
	const country = record.pays ? String(record.pays) : null;
	const rolesByCountry = extractRegafiRolesByCountry(record.authorisations, country);
	return {
		siren: String(record.siren || ''),
		denomination: String(record.denomination || record.denomination || '(sans nom)'),
		ville: record.ville ? String(record.ville) : null,
		pays: country,
		categorie: record.categorie ? String(record.categorie) : null,
		lei: record.lei ? String(record.lei) : null,
		idReferentiel: record.id_referentiel ? String(record.id_referentiel) : undefined,
		source: 'regafi',
		authorisations: record.authorisations ? JSON.stringify(record.authorisations) : null,
		rolesByCountry,
		rolesSummary: summarizeRoles(rolesByCountry)
	};
}

export function getRegafiCategories(): string[] {
	return [
		'Agent PSP',
		'Établissement de Crédit',
		'Entreprise d\'Investissement',
		'Établissement de Paiement',
		'Établissement de Monnaie Électronique',
		'Prestataire de services d\'informations sur les comptes (PSIC)',
		'Changeur manuel',
		'Société de financement',
		'Succursale de pays tiers',
		'Bureau de représentation',
		'Compagnie financière holding',
		'Gestionnaire de crédits',
		'Compagnie holding d\'investissement',
		'Compagnie holding mixte',
		'Établissement financier',
		'Autres prestataires de services de paiement',
		'Entreprise mère mixte de société de financement',
		'Société de tiers-financement',
		'Commercialisation par des banques de pays tiers',
		'Entreprise mère de société de financement',
		'Institut de microfinance'
	];
}
