import type { NormalizedEntity, CountryRoles, ErlaubnisDetail } from '$lib/types';
import { parseCsv } from './csv-parser';
import { extractRoleFromErlaubnis } from './bafin-role-map';
import type { ParseInput } from './types';

interface ErlaubnisEntry {
	text: string;
	startDate: string | null;
	endDate: string | null;
	endReason: string | null;
}

export async function parseBafinEntities(input: ParseInput): Promise<NormalizedEntity[]> {
	if (!input.text) throw new Error('BaFin parser requires CSV text');

	const rawRows = parseCsv(input.text, ';');
	if (rawRows.length === 0) return [];

	// Group continuation rows: rows with empty NAME belong to the previous company
	const groups: { base: Record<string, string>; erlaubnisse: ErlaubnisEntry[] }[] = [];

	for (const row of rawRows) {
		const name = (row['NAME'] ?? '').trim();
		if (name) {
			const entry = buildErlaubnisEntry(row);
			groups.push({
				base: row,
				erlaubnisse: entry.text ? [entry] : []
			});
		} else {
			// Continuation row - add Erlaubnis to the previous company
			const entry = buildErlaubnisEntry(row);
			if (entry.text && groups.length > 0) {
				groups[groups.length - 1].erlaubnisse.push(entry);
			}
		}
	}

	return groups.map((group) => bafinRowToEntity(group.base, group.erlaubnisse));
}

function buildErlaubnisEntry(row: Record<string, string>): ErlaubnisEntry {
	return {
		text: (row['ERLAUBNISSE/ZULASSUNG/TÄTIGKEITEN'] ?? '').trim(),
		startDate: (row['ERTEILUNGSDATUM'] ?? '').trim() || null,
		endDate: (row['ENDE AM'] ?? '').trim() || null,
		endReason: (row['ENDEGRUND'] ?? '').trim() || null
	};
}

/**
 * Extract the comparable ID from a BaFin BAK NR value.
 * Handles both plain numbers ("149489") and composite formats
 * like "1302032/BAKNR:148509" — in the latter case, takes the
 * part after the last colon.
 */
function extractBakNrForSiren(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return '';

	// Composite format: "1302032/BAKNR:148509" → "148509"
	const colonIndex = trimmed.lastIndexOf(':');
	if (colonIndex >= 0) {
		const afterColon = trimmed.slice(colonIndex + 1).replace(/\D/g, '');
		if (afterColon) return afterColon;
	}

	// Plain number: "149489"
	return trimmed;
}

function bafinRowToEntity(row: Record<string, string>, erlaubnisse: ErlaubnisEntry[]): NormalizedEntity {
	const name = (row['NAME'] ?? '').trim();
	const ort = (row['ORT'] ?? '').trim();
	const land = (row['LAND'] ?? '').trim();
	const lei = (row['LEI'] ?? '').trim();
	const gattung = (row['GATTUNG'] ?? '').trim();

	// Extract PSD2 roles from Erlaubnisse
	const roles = new Set<string>();
	for (const entry of erlaubnisse) {
		if (entry.endDate) continue; // expired permission
			const role = extractRoleFromErlaubnis(entry.text, gattung);
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

	const erlaubnisseDetails: ErlaubnisDetail[] = erlaubnisse.map((e) => ({
		text: e.text,
		startDate: e.startDate,
		endDate: e.endDate,
		endReason: e.endReason
	}));

	return {
		siren: extractBakNrForSiren(row['BAK NR'] ?? ''),
		denomination: name || '(sans nom)',
		ville: ort || null,
		pays: land || null,
		categorie: gattung || null,
		lei: lei || null,
		source: 'bafin',
		rolesByCountry,
		rolesSummary: roles.size > 0 ? [...roles].join(', ') : '',
		erlaubnisseDetails: erlaubnisseDetails.length > 0 ? erlaubnisseDetails : undefined,
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
			erlaubnisseRaw: erlaubnisse.length > 0 ? erlaubnisse.map((e) => e.text).join(' | ') : null
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
