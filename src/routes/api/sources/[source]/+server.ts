import { json } from '@sveltejs/kit';
import {
	getDatasetLoadProgress,
	getDatasetPage,
	getLatestDatasetPage,
	persistDataset,
	getFilteredEntities,
	entitiesToCsv
} from '$lib/server/dataset-store';
import { getSource, getColumnsForSource } from '$lib/server/sources/registry';
import type { SourceId } from '$lib/types';

export async function POST({ params, request }) {
	const sourceId = params.source;
	const source = getSource(sourceId);

	if (!source) {
		return json({ success: false, error: `Source inconnue: ${sourceId}` }, { status: 404 });
	}

	try {
		// EBA: stream-based parsing needs the raw ReadableStream
		if (sourceId.startsWith('eba') && request.body) {
			console.info('[sources/eba] Starting stream parse...');
			const entities = await source.parse({ type: 'json', stream: request.body });
			console.info('[sources/eba] Parsed', entities.length, 'entities');
			const stored = await persistDataset(sourceId as SourceId, entities);
			console.info('[sources/eba] Persisted dataset', stored.datasetId, 'with', stored.count, 'entities');
			return json({ success: true, datasetId: stored.datasetId, count: stored.count });
		}

		const contentType = request.headers.get('content-type') || '';

		if (contentType.includes('application/json')) {
			const text = await request.text();

			if (!text) {
				return json({ success: false, error: 'Aucun body fourni' }, { status: 400 });
			}

			const entities = await source.parse({ type: 'json', text });
			const stored = await persistDataset(sourceId as SourceId, entities);
			return json({ success: true, datasetId: stored.datasetId, count: stored.count });
		}

		// CSV upload
		if (source.uploadFormats.includes('csv')) {
			const text = await request.text();
			const entities = await source.parse({ type: 'csv', text });
			const stored = await persistDataset(sourceId as SourceId, entities);
			return json({ success: true, datasetId: stored.datasetId, count: stored.count });
		}

		return json({ success: false, error: 'Format non supporté' }, { status: 400 });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Erreur inconnue';
		console.error(`[${sourceId.toUpperCase()}] ERROR:`, message, error instanceof Error ? error.stack : '');
		return json({ success: false, error: message }, { status: 500 });
	}
}

export async function GET({ params, url }) {
	const sourceId = params.source;
	const source = getSource(sourceId);

	if (!source) {
		return json({ success: false, error: `Source inconnue: ${sourceId}` }, { status: 404 });
	}

	const columns = getColumnsForSource(sourceId);
	const allowedKeys = columns.map((c) => c.key);

	try {
		const datasetId = url.searchParams.get('datasetId');
		const latest = url.searchParams.get('latest') === '1';
		const progressOnly = url.searchParams.get('progressOnly') === '1';
		const progressRequestId = url.searchParams.get('progressRequestId');
		const page = Number(url.searchParams.get('page') || '1');
		const pageSize = Number(url.searchParams.get('pageSize') || '10');
		const textFilters = parseTextFilterMap(url.searchParams.get('textFilters'), allowedKeys);
		const excludeFilters = parseExcludeFilterMap(url.searchParams.get('excludeFilters'), allowedKeys);
		const sortParam = url.searchParams.get('sortKey');
		const sortDir = url.searchParams.get('sortDir') === 'desc' ? 'desc' as const : 'asc' as const;
		const sortKey = sortParam && (allowedKeys.includes(sortParam) || sortParam === 'none')
			? sortParam
			: 'siren';

		if (progressOnly) {
			if (!progressRequestId) {
				return json({ success: false, error: 'progressRequestId requis' }, { status: 400 });
			}

			return json({ success: true, progress: getDatasetLoadProgress(progressRequestId) });
		}

		if (latest) {
			const result = await getLatestDatasetPage(sourceId as SourceId, {
				page: Number.isFinite(page) && page > 0 ? page : 1,
				pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100000) : 10,
				textFilters,
				excludeFilters,
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
			const columnKeys = columnsParam
				? columnsParam.split(',').filter((k) => allowedKeys.includes(k))
				: allowedKeys;
			const entities = await getFilteredEntities(
				sourceId as SourceId, datasetId, textFilters, excludeFilters, sortKey, sortDir
			);
			const csv = entitiesToCsv(entities, columnKeys, sourceId as SourceId);
			return new Response(csv, {
				status: 200,
				headers: {
					'Content-Type': 'text/csv; charset=utf-8',
					'Content-Disposition': `attachment; filename="${sourceId}-export-${Date.now()}.csv"`
				}
			});
		}

		if (!datasetId) {
			return json({ success: false, error: 'datasetId requis' }, { status: 400 });
		}

		const result = await getDatasetPage(sourceId as SourceId, datasetId, {
			page: Number.isFinite(page) && page > 0 ? page : 1,
			pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100000) : 10,
			textFilters,
			excludeFilters,
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

function parseTextFilterMap(raw: string | null, allowedKeys: string[]): Record<string, string> {
	if (!raw) return {};

	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return {};

		const result: Record<string, string> = {};
		for (const key of allowedKeys) {
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

function parseExcludeFilterMap(raw: string | null, allowedKeys: string[]): Record<string, string[]> {
	if (!raw) return {};

	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return {};

		const result: Record<string, string[]> = {};
		for (const key of allowedKeys) {
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
