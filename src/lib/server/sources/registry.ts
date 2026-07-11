import type { SourceDefinition, SourceColumnDef, SourceId, ParseInput } from './types';
import type { NormalizedEntity } from '$lib/types';
import { parseEbaStream } from '$lib/server/eba';
import {
	fetchRegafiEntities,
	parseRegafiJson,
	normalizeRegafiEntity,
	normalizeFlatEntity
} from '$lib/server/regafi';
import { parseBafinEntities } from './bafin-adapter';
import { parseFmaEntities } from './fma-adapter';

const EBA_COLUMNS: SourceColumnDef[] = [
	{ key: 'siren', label: 'SIREN', sortable: true, filterType: 'text-select', widthClass: 'w-28' },
	{ key: 'denomination', label: 'Dénomination', sortable: true, filterType: 'text', widthClass: 'w-36' },
	{ key: 'ville', label: 'Ville', sortable: true, filterType: 'text-select', widthClass: 'w-36' },
	{ key: 'pays', label: 'Pays', sortable: true, filterType: 'select', widthClass: 'w-28' },
	{ key: 'categorie', label: 'Catégorie', sortable: true, filterType: 'select', widthClass: 'w-44' },
	{ key: 'rolesSummary', label: 'Rôles PSD2', sortable: false, filterType: 'none', widthClass: 'w-64' },
	{ key: 'idReferentiel', label: 'ID référentiel', sortable: true, filterType: 'text-select', widthClass: 'w-36' },
	{ key: 'cib', label: 'CIB', sortable: true, filterType: 'text-select', widthClass: 'w-36' },
	{ key: 'lei', label: 'LEI', sortable: true, filterType: 'text-select', widthClass: 'w-44' },
	{ key: 'entityType', label: "Type d'entité", sortable: true, filterType: 'select', widthClass: 'w-36' }
];

const REGAFI_COLUMNS: SourceColumnDef[] = [
	{ key: 'siren', label: 'SIREN', sortable: true, filterType: 'text-select', widthClass: 'w-28' },
	{ key: 'denomination', label: 'Dénomination', sortable: true, filterType: 'text', widthClass: 'w-36' },
	{ key: 'ville', label: 'Ville', sortable: true, filterType: 'text-select', widthClass: 'w-36' },
	{ key: 'pays', label: 'Pays', sortable: true, filterType: 'select', widthClass: 'w-28' },
	{ key: 'categorie', label: 'Catégorie', sortable: true, filterType: 'select', widthClass: 'w-44' },
	{ key: 'rolesSummary', label: 'Rôles PSD2', sortable: false, filterType: 'none', widthClass: 'w-64' },
	{ key: 'lei', label: 'LEI', sortable: true, filterType: 'text-select', widthClass: 'w-44' },
	{ key: 'idReferentiel', label: 'ID référentiel', sortable: true, filterType: 'text-select', widthClass: 'w-44' }
];

async function ebaParse(input: ParseInput): Promise<NormalizedEntity[]> {
	if (input.stream) {
		return parseEbaStream(input.stream);
	}
	throw new Error('EBA parser requires a ReadableStream body');
}

async function regafiParse(input: ParseInput): Promise<NormalizedEntity[]> {
	if (input.apiKey) {
		return fetchRegafiEntities(input.apiKey);
	}
	if (input.text) {
		const body = JSON.parse(input.text);
		if (Array.isArray(body)) {
			return body.map(normalizeFlatEntity);
		}
		if (body.results) {
			return body.results.map(normalizeRegafiEntity);
		}
		if (body.json) {
			return parseRegafiJson(body.json);
		}
		return parseRegafiJson(input.text);
	}
	throw new Error('Regafi parser requires text body or apiKey');
}

const BAFIN_COLUMNS: SourceColumnDef[] = [
	{ key: 'denomination', label: 'Name', sortable: true, filterType: 'text', widthClass: 'w-36' },
	{ key: 'ville', label: 'Ort', sortable: true, filterType: 'text-select', widthClass: 'w-28' },
	{ key: 'pays', label: 'Land', sortable: true, filterType: 'select', widthClass: 'w-24' },
	{ key: 'categorie', label: 'Gattung', sortable: true, filterType: 'select', widthClass: 'w-44' },
	{ key: 'lei', label: 'LEI', sortable: true, filterType: 'text-select', widthClass: 'w-36' },
	{ key: 'rolesSummary', label: 'Rôles PSD2', sortable: false, filterType: 'none', widthClass: 'w-40' },
	{ key: 'extra:bakNr', label: 'BAK NR', sortable: true, filterType: 'text-select', widthClass: 'w-24' },
	{ key: 'extra:bafinId', label: 'BaFin-ID', sortable: true, filterType: 'text-select', widthClass: 'w-28' },
	{ key: 'extra:regNr', label: 'REG NR', sortable: true, filterType: 'text-select', widthClass: 'w-24' },
	{ key: 'extra:erlaubnisseRaw', label: 'Erlaubnisse', sortable: false, filterType: 'none', widthClass: 'w-64' }
];

const FMA_COLUMNS: SourceColumnDef[] = [
	{ key: 'denomination', label: 'Name', sortable: true, filterType: 'text', widthClass: 'w-36' },
	{ key: 'ville', label: 'Stadt/Ort', sortable: true, filterType: 'text-select', widthClass: 'w-28' },
	{ key: 'pays', label: 'Land', sortable: true, filterType: 'select', widthClass: 'w-20' },
	{ key: 'extra:plz', label: 'PLZ', sortable: true, filterType: 'text-select', widthClass: 'w-20' },
	{ key: 'extra:strasse', label: 'Straße', sortable: true, filterType: 'text', widthClass: 'w-36' },
	{ key: 'extra:bankleitzahl', label: 'Bankleitzahl', sortable: true, filterType: 'text-select', widthClass: 'w-28' },
	{ key: 'extra:firmenbuchnummer', label: 'Firmenbuchnr.', sortable: true, filterType: 'text-select', widthClass: 'w-32' },
	{ key: 'extra:website', label: 'Website', sortable: false, filterType: 'none', widthClass: 'w-36' }
];

const SOURCES: Partial<Record<SourceId, SourceDefinition>> = {
	eba: {
		id: 'eba',
		name: 'EBA',
		country: 'EU',
		accentColor: 'blue',
		uploadFormats: ['json'],
		columns: EBA_COLUMNS,
		parse: ebaParse
	},
	regafi: {
		id: 'regafi',
		name: 'REGAFI',
		country: 'FR',
		accentColor: 'red',
		uploadFormats: ['json'],
		columns: REGAFI_COLUMNS,
		parse: regafiParse
	},
	bafin: {
		id: 'bafin',
		name: 'BaFin',
		country: 'DE',
		accentColor: 'green',
		uploadFormats: ['csv'],
		columns: BAFIN_COLUMNS,
		parse: parseBafinEntities
	},
	fma: {
		id: 'fma',
		name: 'FMA',
		country: 'AT',
		accentColor: 'amber',
		uploadFormats: ['csv'],
		columns: FMA_COLUMNS,
		parse: parseFmaEntities
	}
};

export function getSource(id: string): SourceDefinition | undefined {
	return SOURCES[id as SourceId];
}

export function getColumnsForSource(id: string): SourceColumnDef[] {
	return getSource(id)?.columns ?? [];
}

export function getAllSources(): SourceDefinition[] {
	return Object.values(SOURCES);
}

export function getColumnKeySet(sourceId: string): Set<string> {
	return new Set(getColumnsForSource(sourceId).map((c) => c.key));
}

export function registerSource(source: SourceDefinition): void {
	SOURCES[source.id] = source;
}
