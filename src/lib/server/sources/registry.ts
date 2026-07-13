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
	{ key: 'siren', label: 'ID', sortable: true, filterType: 'text-select' },
	{ key: 'denomination', label: 'Name', sortable: true, filterType: 'text' },
	{ key: 'ville', label: 'City', sortable: true, filterType: 'text-select' },
	{ key: 'pays', label: 'Country', sortable: true, filterType: 'select' },
	{ key: 'categorie', label: 'Category', sortable: true, filterType: 'select' },
	{ key: 'rolesSummary', label: 'PSD2 Roles', sortable: false, filterType: 'select' },
	{ key: 'rolesCountry', label: 'Role Country', sortable: false, filterType: 'select' },
	{ key: 'idReferentiel', label: 'Reference ID', sortable: true, filterType: 'text-select' },
	{ key: 'cib', label: 'CIB', sortable: true, filterType: 'text-select' },
	{ key: 'lei', label: 'LEI', sortable: true, filterType: 'text-select' },
	{ key: 'entityType', label: 'Entity Type', sortable: true, filterType: 'select' }
];

const REGAFI_COLUMNS: SourceColumnDef[] = [
	{ key: 'cib', label: 'CIB', sortable: true, filterType: 'text-select' },
	{ key: 'siren', label: 'SIREN', sortable: true, filterType: 'text-select' },
	{ key: 'denomination', label: 'Denomination', sortable: true, filterType: 'text' },
	{ key: 'ville', label: 'Ville', sortable: true, filterType: 'text-select' },
	{ key: 'pays', label: 'Pays', sortable: true, filterType: 'select' },
	{ key: 'categorie', label: 'Categorie', sortable: true, filterType: 'select' },
	{ key: 'rolesSummary', label: 'Roles PSD2', sortable: false, filterType: 'select' },
	{ key: 'rolesCountry', label: 'Pays du role', sortable: false, filterType: 'select' },
	{ key: 'lei', label: 'LEI', sortable: true, filterType: 'text-select' },
	{ key: 'idReferentiel', label: 'ID referentiel', sortable: true, filterType: 'text-select' }
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
	{ key: 'siren', label: 'BAK NR', sortable: true, filterType: 'text-select' },
	{ key: 'denomination', label: 'Name', sortable: true, filterType: 'text' },
	{ key: 'ville', label: 'Ort', sortable: true, filterType: 'text-select' },
	{ key: 'pays', label: 'Land', sortable: true, filterType: 'select' },
	{ key: 'categorie', label: 'Gattung', sortable: true, filterType: 'select' },
	{ key: 'lei', label: 'LEI', sortable: true, filterType: 'text-select' },
	{ key: 'rolesSummary', label: 'Roles PSD2', sortable: false, filterType: 'select' },
	{ key: 'rolesCountry', label: 'Pays du role', sortable: false, filterType: 'select' },
	{ key: 'extra:bafinId', label: 'BaFin-ID', sortable: true, filterType: 'text-select' },
	{ key: 'extra:regNr', label: 'REG NR', sortable: true, filterType: 'text-select' },
	{ key: 'erlaubnisseDetails', label: 'Erlaubnisse', sortable: false, filterType: 'text' }
];

const FMA_COLUMNS: SourceColumnDef[] = [
	{ key: 'denomination', label: 'Name', sortable: true, filterType: 'text' },
	{ key: 'ville', label: 'Stadt/Ort', sortable: true, filterType: 'text-select' },
	{ key: 'pays', label: 'Land', sortable: true, filterType: 'select' },
	{ key: 'extra:plz', label: 'PLZ', sortable: true, filterType: 'text-select' },
	{ key: 'extra:strasse', label: 'Strasse', sortable: true, filterType: 'text' },
	{ key: 'extra:bankleitzahl', label: 'Bankleitzahl', sortable: true, filterType: 'text-select' },
	{ key: 'extra:firmenbuchnummer', label: 'Firmenbuchnr.', sortable: true, filterType: 'text-select' },
	{ key: 'extra:website', label: 'Website', sortable: false, filterType: 'none' }
];

/** Wraps a parse function so every entity carries the variant's source ID. */
function withSourceLabel(
	sourceId: SourceId,
	parseFn: (input: ParseInput) => Promise<NormalizedEntity[]>
): (input: ParseInput) => Promise<NormalizedEntity[]> {
	return async (input) => {
		const entities = await parseFn(input);
		return entities.map((e) => ({ ...e, source: sourceId }));
	};
}

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
	'eba-credit': {
		id: 'eba-credit',
		name: 'EBA Credit',
		country: 'EU',
		accentColor: 'blue',
		uploadFormats: ['json'],
		columns: EBA_COLUMNS,
		parse: withSourceLabel('eba-credit', ebaParse)
	},
	'eba-payment': {
		id: 'eba-payment',
		name: 'EBA Payment',
		country: 'EU',
		accentColor: 'purple',
		uploadFormats: ['json'],
		columns: EBA_COLUMNS,
		parse: withSourceLabel('eba-payment', ebaParse)
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
	'regafi-credit': {
		id: 'regafi-credit',
		name: 'REGAFI Credit',
		country: 'FR',
		accentColor: 'red',
		uploadFormats: ['json'],
		columns: REGAFI_COLUMNS,
		parse: withSourceLabel('regafi-credit', regafiParse)
	},
	'regafi-payment': {
		id: 'regafi-payment',
		name: 'REGAFI Payment',
		country: 'FR',
		accentColor: 'purple',
		uploadFormats: ['json'],
		columns: REGAFI_COLUMNS,
		parse: withSourceLabel('regafi-payment', regafiParse)
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
	'bafin-credit': {
		id: 'bafin-credit',
		name: 'BaFin Credit',
		country: 'DE',
		accentColor: 'green',
		uploadFormats: ['csv'],
		columns: BAFIN_COLUMNS,
		parse: withSourceLabel('bafin-credit', parseBafinEntities)
	},
	'bafin-payment': {
		id: 'bafin-payment',
		name: 'BaFin Payment',
		country: 'DE',
		accentColor: 'purple',
		uploadFormats: ['csv'],
		columns: BAFIN_COLUMNS,
		parse: withSourceLabel('bafin-payment', parseBafinEntities)
	},
	fma: {
		id: 'fma',
		name: 'FMA',
		country: 'AT',
		accentColor: 'amber',
		uploadFormats: ['csv'],
		columns: FMA_COLUMNS,
		parse: parseFmaEntities
	},
	'fma-credit': {
		id: 'fma-credit',
		name: 'FMA Credit',
		country: 'AT',
		accentColor: 'amber',
		uploadFormats: ['csv'],
		columns: FMA_COLUMNS,
		parse: withSourceLabel('fma-credit', parseFmaEntities)
	},
	'fma-payment': {
		id: 'fma-payment',
		name: 'FMA Payment',
		country: 'AT',
		accentColor: 'purple',
		uploadFormats: ['csv'],
		columns: FMA_COLUMNS,
		parse: withSourceLabel('fma-payment', parseFmaEntities)
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
