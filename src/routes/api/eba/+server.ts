import { json } from '@sveltejs/kit';
import { getDatasetLoadProgress, getDatasetPage, getLatestDatasetPage, persistDataset, getFilteredEntities, entitiesToCsv } from '$lib/server/dataset-store';
import { parseEbaStream } from '$lib/server/eba';

const ALLOWED_FILTER_KEYS = [
	'siren',
	'denomination',
	'ville',
	'pays',
	'categorie',
	'rolesSummary',
	'rolesCountry',
	'rolesName',
	'entityCode',
	'lei',
	'idReferentiel',
	'cib',
	'entityType'
] as const;

type AllowedFilterKey = (typeof ALLOWED_FILTER_KEYS)[number];

function parseTextFilterMap(raw: string | null): Partial<Record<AllowedFilterKey, string>> {
	if (!raw) return {};

	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return {};

		const result: Partial<Record<AllowedFilterKey, string>> = {};
		for (const key of ALLOWED_FILTER_KEYS) {
			const value = parsed[key];
			if (typeof value === 'string') {
				result[key] = value;
			}
		}
		return result;
	} catch {
		return {};
	}
}

function parseSelectFilterMap(raw: string | null): Partial<Record<AllowedFilterKey, string[]>> {
	if (!raw) return {};

	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return {};

		const result: Partial<Record<AllowedFilterKey, string[]>> = {};
		for (const key of ALLOWED_FILTER_KEYS) {
			const value = parsed[key];
			if (typeof value === 'string') {
				result[key] = value ? [value] : [];
			}
			if (Array.isArray(value)) {
				result[key] = value.filter((item): item is string => typeof item === 'string');
			}
		}
		return result;
	} catch {
		return {};
	}
}

export async function POST({ request }) {
	try {
		if (!request.body) {
			return json({ success: false, error: 'Aucun body fourni' }, { status: 400 });
		}

		const french = await parseEbaStream(request.body);
		const stored = await persistDataset('eba', french);

		return json({ success: true, datasetId: stored.datasetId, count: stored.count });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Erreur inconnue';
		console.error('[EBA] ERROR:', message, error instanceof Error ? error.stack : '');
		return json({ success: false, error: message }, { status: 500 });
	}
}

export async function GET({ url }) {
	try {
		const datasetId = url.searchParams.get('datasetId');
		const latest = url.searchParams.get('latest') === '1';
		const progressOnly = url.searchParams.get('progressOnly') === '1';
		const progressRequestId = url.searchParams.get('progressRequestId');
		const page = Number(url.searchParams.get('page') || '1');
		const pageSize = Number(url.searchParams.get('pageSize') || '10');
		const textFilters = parseTextFilterMap(url.searchParams.get('textFilters'));
		const selectFilters = parseSelectFilterMap(url.searchParams.get('selectFilters'));
		const sortParam = url.searchParams.get('sortKey');
		const sortDir = url.searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc';
		const sortKey = sortParam && ALLOWED_FILTER_KEYS.includes(sortParam as AllowedFilterKey)
			? (sortParam as AllowedFilterKey)
			: sortParam === 'none'
				? 'none'
				: 'siren';

		if (progressOnly) {
			if (!progressRequestId) {
				return json({ success: false, error: 'progressRequestId requis' }, { status: 400 });
			}

			return json({ success: true, progress: getDatasetLoadProgress(progressRequestId) });
		}

		if (latest) {
			const result = await getLatestDatasetPage('eba', {
				page: Number.isFinite(page) && page > 0 ? page : 1,
				pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100000) : 10,
				textFilters,
				selectFilters,
				sortKey,
				sortDir,
				progressRequestId
			});

			return json({ success: true, ...result });
		}

		if (url.searchParams.get('export') === 'csv') {
			if (!datasetId) {
				return new Response('datasetId requis', { status: 400 });
			}
			const columnsParam = url.searchParams.get('columns') || '';
			const columnKeys = columnsParam ? columnsParam.split(',').filter((k) => ALLOWED_FILTER_KEYS.includes(k as AllowedFilterKey)) : [...ALLOWED_FILTER_KEYS];
			const entities = await getFilteredEntities('eba', datasetId, textFilters, selectFilters, sortKey, sortDir);
			const csv = entitiesToCsv(entities, columnKeys);
			return new Response(csv, {
				status: 200,
				headers: {
					'Content-Type': 'text/csv; charset=utf-8',
					'Content-Disposition': `attachment; filename="eba-export-${Date.now()}.csv"`
				}
			});
		}

		if (!datasetId) {
			return json({ success: false, error: 'datasetId requis' }, { status: 400 });
		}

		const result = await getDatasetPage('eba', datasetId, {
			page: Number.isFinite(page) && page > 0 ? page : 1,
			pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100000) : 10,
			textFilters,
			selectFilters,
			sortKey,
			sortDir,
			progressRequestId
		});

		return json({ success: true, datasetId, ...result });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Erreur inconnue';
		return json({ success: false, error: message }, { status: 500 });
	}
}
