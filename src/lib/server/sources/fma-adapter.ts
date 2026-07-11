import type { NormalizedEntity } from '$lib/types';
import { parseCsv } from './csv-parser';
import type { ParseInput } from './types';

export async function parseFmaEntities(input: ParseInput): Promise<NormalizedEntity[]> {
	if (!input.text) throw new Error('FMA parser requires CSV text');

	const rows = parseCsv(input.text, ';');
	if (rows.length === 0) return [];

	return rows
		.filter((row) => (row['Name'] ?? '').trim())
		.map(fmaRowToEntity);
}

function fmaRowToEntity(row: Record<string, string>): NormalizedEntity {
	const name = (row['Name'] ?? '').trim();
	const stadt = (row['Stadt/Ort'] ?? '').trim();
	const land = (row['Land'] ?? '').trim();

	return {
		siren: '',
		denomination: name || '(sans nom)',
		ville: stadt || null,
		pays: land || null,
		categorie: null,
		lei: null,
		source: 'fma',
		extra: {
			strasse: (row['Straße'] ?? '').trim() || null,
			plz: (row['PLZ'] ?? '').trim() || null,
			telefon: (row['Telefon'] ?? '').trim() || null,
			fax: (row['Fax'] ?? '').trim() || null,
			email: (row['E-Mail'] ?? '').trim() || null,
			website: (row['Website'] ?? '').trim() || null,
			bankleitzahl: (row['Bankleitzahl'] ?? '').trim() || null,
			firmenbuchnummer: (row['Firmenbuchnummer'] ?? '').trim() || null
		}
	};
}
