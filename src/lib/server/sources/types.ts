import type { NormalizedEntity } from '$lib/types';

export type SourceId = 'eba' | 'regafi' | 'bafin' | 'fma';

export interface SourceColumnDef {
	key: string;
	label: string;
	sortable: boolean;
	filterType: 'none' | 'text' | 'select' | 'text-select';
	widthClass?: string;
}

export interface SourceDefinition {
	id: SourceId;
	name: string;
	country: string;
	accentColor: string;
	uploadFormats: Array<'json' | 'csv'>;
	columns: SourceColumnDef[];
	parse: (input: ParseInput) => Promise<NormalizedEntity[]>;
}

export interface ParseInput {
	type: 'json' | 'csv';
	stream?: ReadableStream<Uint8Array>;
	text?: string;
	apiKey?: string;
	progressReporter?: ProgressReporter;
}

export interface ProgressReporter {
	running(percent: number, message: string): void;
	done(percent: number, message: string): void;
	error(message: string): void;
}
