import { json } from '@sveltejs/kit';
import { getDatasetPage, persistDataset } from '$lib/server/dataset-store';
import { parseEbaStream } from '$lib/server/eba';

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
		const page = Number(url.searchParams.get('page') || '1');
		const pageSize = Number(url.searchParams.get('pageSize') || '10');
		const search = url.searchParams.get('search') || '';
		const sortKey = url.searchParams.get('sortKey') === 'denomination' ? 'denomination' : 'siren';

		if (!datasetId) {
			return json({ success: false, error: 'datasetId requis' }, { status: 400 });
		}

		const result = await getDatasetPage('eba', datasetId, {
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
