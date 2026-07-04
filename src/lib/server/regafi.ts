import type { RegafiRecord, NormalizedEntity } from '$lib/types';

const REGAFI_BASE = 'https://developer.regafi.banque-france.fr/api/explore/v2.1';
const DATASET = 'catalogue-banque';

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
    return (records as RegafiRecord[]).map(normalizeRegafiEntity);
  } else {
    return records.map((r) => normalizeFlatEntity(r as Record<string, unknown>));
  }
}

export function normalizeRegafiEntity(record: RegafiRecord): NormalizedEntity {
	const f = record.fields;
	return {
		siren: f?.siren || '',
		denomination: f?.denomination || '(sans nom)',
		ville: f?.ville || null,
		pays: f?.pays || null,
		categorie: f?.categorie || null,
		lei: f?.lei || null,
		idReferentiel: f?.id_referentiel,
		source: 'regafi',
		authorisations: f?.authorisations ? JSON.stringify(f.authorisations) : null
	};
}

export function normalizeFlatEntity(record: Record<string, unknown>): NormalizedEntity {
	return {
		siren: String(record.siren || ''),
		denomination: String(record.denomination || record.denomination || '(sans nom)'),
		ville: record.ville ? String(record.ville) : null,
		pays: record.pays ? String(record.pays) : null,
		categorie: record.categorie ? String(record.categorie) : null,
		lei: record.lei ? String(record.lei) : null,
		idReferentiel: record.id_referentiel ? String(record.id_referentiel) : undefined,
		source: 'regafi',
		authorisations: record.authorisations ? JSON.stringify(record.authorisations) : null
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
