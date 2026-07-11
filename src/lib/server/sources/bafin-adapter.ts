import type { NormalizedEntity, CountryRoles } from '$lib/types';
import { parseCsv } from './csv-parser';
import { extractRoleFromErlaubnis } from './bafin-role-map';
import type { ParseInput } from './types';

export async function parseBafinEntities(input: ParseInput): Promise<NormalizedEntity[]> {
	if (!input.text) throw new Error('BaFin parser requires CSV text');

	const rawRows = parseCsv(input.text, ';');
	if (rawRows.length === 0) return [];

	// Group continuation rows: rows with empty NAME belong to the previous company
	const groups: { base: Record<string, string>; erlaubnisse: string[] }[] = [];

	for (const row of rawRows) {
		const name = (row['NAME'] ?? '').trim();
		if (name) {
			const erlaubnis = (row['ERLAUBNISSE/ZULASSUNG/TÄTIGKEITEN'] ?? '').trim();
			groups.push({
				base: row,
				erlaubnisse: erlaubnis ? [erlaubnis] : []
			});
		} else {
			// Continuation row - add Erlaubnis to the previous company
			const erlaubnis = (row['ERLAUBNISSE/ZULASSUNG/TÄTIGKEITEN'] ?? '').trim();
			if (erlaubnis && groups.length > 0) {
				groups[groups.length - 1].erlaubnisse.push(erlaubnis);
			}
		}
	}

	return groups.map((group) => bafinRowToEntity(group.base, group.erlaubnisse));
}

function bafinRowToEntity(row: Record<string, string>, erlaubnisse: string[]): NormalizedEntity {
	const name = (row['NAME'] ?? '').trim();
	const ort = (row['ORT'] ?? '').trim();
	const land = (row['LAND'] ?? '').trim();
	const lei = (row['LEI'] ?? '').trim();
	const gattung = (row['GATTUNG'] ?? '').trim();

	// Extract PSD2 roles from Erlaubnisse
	const roles = new Set<string>();
	for (const erlaubnis of erlaubnisse) {
		const role = extractRoleFromErlaubnis(erlaubnis);
		if (role) roles.add(role);
	}

	const rolesByCountry: CountryRoles[] = [];
	if (roles.size > 0) {
		const countryCode = landToCountryCode(land);
		rolesByCountry.push({
			countryCode,
			countryName: land || countryCode,
			roles: [...roles]
		});
	}

	return {
		siren: '',
		denomination: name || '(sans nom)',
		ville: ort || null,
		pays: land || null,
		categorie: gattung || null,
		lei: lei || null,
		source: 'bafin',
		rolesByCountry,
		rolesSummary: roles.size > 0 ? [...roles].join(', ') : '',
		extra: {
			bakNr: (row['BAK NR'] ?? '').trim() || null,
			regNr: (row['REG NR'] ?? '').trim() || null,
			bafinId: (row['BAFIN-ID'] ?? '').trim() || null,
			nationaleId: (row['NATIONALE IDENTIFIKATIONSNUMMER DER BEHÖRDE DES HERKUNFTSMITGLIEDSTAATES'] ?? '').trim() || null,
			plz: (row['PLZ'] ?? '').trim() || null,
			strasse: (row['STRASSE'] ?? '').trim() || null,
			gattung: gattung || null,
			schlichtungsstelle: (row['SCHLICHTUNGSSTELLE'] ?? '').trim() || null,
			handelsnamen: (row['HANDELSNAMEN'] ?? '').trim() || null,
			erlaubnisseRaw: erlaubnisse.length > 0 ? erlaubnisse.join(' | ') : null
		}
	};
}

const LAND_TO_CODE: Record<string, string> = {
	'Deutschland': 'DE',
	'Frankreich': 'FR',
	'Niederlande': 'NL',
	'Irland': 'IE',
	'Dänemark': 'DK',
	'Luxemburg': 'LU',
	'Finnland': 'FI',
	'Liechtenstein': 'LI',
	'Austria': 'AT',
	'Österreich': 'AT',
	'Italien': 'IT',
	'Spanien': 'ES',
	'Belgien': 'BE',
	'Schweden': 'SE',
	'Norwegen': 'NO',
	'Polen': 'PL',
	'Tschechien': 'CZ',
	'Portugal': 'PT',
	'Griechenland': 'GR',
	'Ungarn': 'HU'
};

function landToCountryCode(land: string): string {
	return LAND_TO_CODE[land] ?? land.slice(0, 2).toUpperCase();
}
