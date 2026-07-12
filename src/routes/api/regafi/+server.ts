import { json } from '@sveltejs/kit';
import { getSource, getColumnsForSource } from '$lib/server/sources/registry';
import {
	getDatasetPage,
	getLatestDatasetPage,
	persistDataset,
	getFilteredEntities,
	entitiesToCsv
} from '$lib/server/dataset-store';

const SOURCE_ID = 'regafi';
const columns = getColumnsForSource(SOURCE_ID);
const ALLOWED_FILTER_KEYS = columns.map((c) => c.key);

function parseTextFilterMap(raw: string | null): Record<string, string> {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return {};
		const result: Record<string, string> = {};
		for (const key of ALLOWED_FILTER_KEYS) {
			const value = parsed[key];
			if (typeof value === 'string') result[key] = value;
		}
		return result;
	} catch { return {}; }
}

function parseExcludeFilterMap(raw: string | null): Record<string, string[]> {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return {};
		const result: Record<string, string[]> = {};
		for (const key of ALLOWED_FILTER_KEYS) {
			const value = parsed[key];
			if (typeof value === 'string') result[key] = value ? [value] : [];
			if (Array.isArray(value)) result[key] = value.filter((item): item is string => typeof item === 'string');
		}
		return result;
	} catch { return {}; }
}

export async function POST({ request }) {
	const source = getSource(SOURCE_ID);
	if (!source) return json({ success: false, error: 'Source non trouvée' }, { status: 500 });

	try {
		const text = await request.text();
		const body = text ? JSON.parse(text) : null;

		if (Array.isArray(body) || body?.results || body?.json || body?.apiKey || typeof body === 'string') {
			const entities = await source.parse({ type: 'json', text });
			const stored = await persistDataset(SOURCE_ID, entities);
			return json({ success: true, datasetId: stored.datasetId, count: stored.count });
		}

		return json({ success: false, error: 'Format JSON non reconnu' }, { status: 400 });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Erreur inconnue';
		console.error('[REGAFI] ERROR:', message);
		return json({ success: false, error: message }, { status: 500 });
	}
}

export async function GET({ url }) {
	try {
		const datasetId = url.searchParams.get('datasetId');
		const latest = url.searchParams.get('latest') === '1';
		const page = Number(url.searchParams.get('page') || '1');
		const pageSize = Number(url.searchParams.get('pageSize') || '10');
		const textFilters = parseTextFilterMap(url.searchParams.get('textFilters'));
		const excludeFilters = parseExcludeFilterMap(url.searchParams.get('excludeFilters'));
		const sortParam = url.searchParams.get('sortKey');
		const sortDir = url.searchParams.get('sortDir') === 'desc' ? 'desc' as const : 'asc' as const;
		const sortKey = sortParam && (ALLOWED_FILTER_KEYS.includes(sortParam) || sortParam === 'none')
			? sortParam : 'siren';

		if (latest) {
			const result = await getLatestDatasetPage(SOURCE_ID, {
				page: Number.isFinite(page) && page > 0 ? page : 1,
				pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100000) : 10,
				textFilters, excludeFilters, sortKey, sortDir
			});
			return json({ success: true, ...result });
		}

		if (url.searchParams.get('export') === 'csv') {
			if (!datasetId) return new Response('datasetId requis', { status: 400 });
			const columnsParam = url.searchParams.get('columns') || '';
			const columnKeys = columnsParam
				? columnsParam.split(',').filter((k) => ALLOWED_FILTER_KEYS.includes(k))
				: [...ALLOWED_FILTER_KEYS];
			const entities = await getFilteredEntities(SOURCE_ID, datasetId, textFilters, excludeFilters, sortKey, sortDir);
			const csv = entitiesToCsv(entities, columnKeys, SOURCE_ID);
			return new Response(csv, {
				status: 200,
				headers: {
					'Content-Type': 'text/csv; charset=utf-8',
					'Content-Disposition': `attachment; filename="regafi-export-${Date.now()}.csv"`
				}
			});
		}

		if (!datasetId) return json({ success: false, error: 'datasetId requis' }, { status: 400 });

		const result = await getDatasetPage(SOURCE_ID, datasetId, {
			page: Number.isFinite(page) && page > 0 ? page : 1,
			pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100000) : 10,
			textFilters, excludeFilters, sortKey, sortDir
		});
		return json({ success: true, datasetId, ...result });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Erreur inconnue';
		return json({ success: false, error: message }, { status: 500 });
	}
}
