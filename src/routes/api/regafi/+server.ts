import { json } from '@sveltejs/kit';
import { getDatasetPage, persistDataset } from '$lib/server/dataset-store';
import { fetchRegafiEntities, parseRegafiJson, normalizeRegafiEntity, normalizeFlatEntity } from '$lib/server/regafi';

export async function POST({ request }) {
	try {
		const body = await request.json();

		if (Array.isArray(body)) {
			const entities = body.map(normalizeFlatEntity);
			const stored = await persistDataset('regafi', entities);
			return json({ success: true, datasetId: stored.datasetId, count: stored.count });
		}
		if (body.results) {
			const entities = body.results.map(normalizeRegafiEntity);
			const stored = await persistDataset('regafi', entities);
			return json({ success: true, datasetId: stored.datasetId, count: stored.count });
		}
		if (body.json) {
			const entities = parseRegafiJson(body.json);
			const stored = await persistDataset('regafi', entities);
			return json({ success: true, datasetId: stored.datasetId, count: stored.count });
		}
		if (body.apiKey) {
			const entities = await fetchRegafiEntities(body.apiKey);
			const stored = await persistDataset('regafi', entities);
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
		const page = Number(url.searchParams.get('page') || '1');
		const pageSize = Number(url.searchParams.get('pageSize') || '10');
		const search = url.searchParams.get('search') || '';
		const sortKey = url.searchParams.get('sortKey') === 'denomination' ? 'denomination' : 'siren';

		if (!datasetId) {
			return json({ success: false, error: 'datasetId requis' }, { status: 400 });
		}

		const result = await getDatasetPage('regafi', datasetId, {
			page: Number.isFinite(page) && page > 0 ? page : 1,
			pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 10,
			search,
			sortKey
		});

		return json({ success: true, datasetId, ...result });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Erreur inconnue';
		return json({ success: false, error: message }, { status: 500 });
	}
}
