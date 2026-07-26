import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/dataset-store', () => ({
	getDatasetLoadProgress: vi.fn(),
	getDatasetPage: vi.fn(),
	getLatestDatasetPage: vi.fn(),
	persistDataset: vi.fn(),
	getFilteredEntities: vi.fn(),
	entitiesToCsv: vi.fn()
}));

vi.mock('$lib/server/sources/registry', () => ({
	getSource: vi.fn(),
	getColumnsForSource: vi.fn()
}));

import { GET, POST } from '../../routes/api/sources/[source]/+server';
import {
	entitiesToCsv,
	getDatasetLoadProgress,
	getFilteredEntities,
	getLatestDatasetPage,
	persistDataset
} from '$lib/server/dataset-store';
import { getColumnsForSource, getSource } from '$lib/server/sources/registry';

const mockGetSource = vi.mocked(getSource);
const mockGetColumnsForSource = vi.mocked(getColumnsForSource);
const mockPersistDataset = vi.mocked(persistDataset);
const mockGetLatestDatasetPage = vi.mocked(getLatestDatasetPage);
const mockGetFilteredEntities = vi.mocked(getFilteredEntities);
const mockEntitiesToCsv = vi.mocked(entitiesToCsv);
const mockGetDatasetLoadProgress = vi.mocked(getDatasetLoadProgress);

describe('/api/sources/[source]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetColumnsForSource.mockReturnValue([
			{ key: 'siren', label: 'SIREN', sortable: true, filterType: 'text-select' }
		]);
	});

	it('returns 404 when source is unknown', async () => {
		mockGetSource.mockReturnValue(undefined);

		const request = new Request('http://localhost/api/sources/unknown', { method: 'POST' });
		const response = await POST({ params: { source: 'unknown' }, request } as never);
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.success).toBe(false);
	});

	it('parses and persists a JSON upload', async () => {
		const parsed = [{ siren: '1', denomination: 'A', ville: null, pays: null, categorie: null, lei: null, source: 'regafi' }];
		mockGetSource.mockReturnValue({
			id: 'regafi',
			name: 'Regafi',
			country: 'FR',
			accentColor: 'red',
			uploadFormats: ['json'],
			columns: [],
			parse: vi.fn().mockResolvedValue(parsed)
		});
		mockPersistDataset.mockResolvedValue({ datasetId: 'regafi-1-abc', count: 1 });

		const request = new Request('http://localhost/api/sources/regafi', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify([{ siren: '1' }])
		});

		const response = await POST({ params: { source: 'regafi' }, request } as never);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toEqual({ success: true, datasetId: 'regafi-1-abc', count: 1 });
		expect(mockPersistDataset).toHaveBeenCalledWith('regafi', parsed);
	});

	it('returns latest dataset page when latest=1', async () => {
		mockGetSource.mockReturnValue({
			id: 'regafi',
			name: 'Regafi',
			country: 'FR',
			accentColor: 'red',
			uploadFormats: ['json'],
			columns: [],
			parse: vi.fn()
		});
		mockGetLatestDatasetPage.mockResolvedValue({
			datasetId: 'regafi-1-abc',
			items: [],
			total: 0,
			page: 1,
			pageSize: 10,
			totalPages: 1,
			filterOptions: {}
		});

		const url = new URL('http://localhost/api/sources/regafi?latest=1&page=1&pageSize=10');
		const response = await GET({ params: { source: 'regafi' }, url } as never);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.datasetId).toBe('regafi-1-abc');
	});

	it('returns csv export when export=csv', async () => {
		mockGetSource.mockReturnValue({
			id: 'regafi',
			name: 'Regafi',
			country: 'FR',
			accentColor: 'red',
			uploadFormats: ['json'],
			columns: [],
			parse: vi.fn()
		});
		mockGetFilteredEntities.mockResolvedValue([
			{ siren: '1', denomination: 'A', ville: null, pays: null, categorie: null, lei: null, source: 'regafi' }
		]);
		mockEntitiesToCsv.mockReturnValue('"SIREN"\n"1"');

		const url = new URL('http://localhost/api/sources/regafi?export=csv&datasetId=regafi-1-abc');
		const response = await GET({ params: { source: 'regafi' }, url } as never);
		const text = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toContain('text/csv');
		expect(text).toContain('"1"');
	});

	it('returns progress error without progressRequestId', async () => {
		mockGetSource.mockReturnValue({
			id: 'regafi',
			name: 'Regafi',
			country: 'FR',
			accentColor: 'red',
			uploadFormats: ['json'],
			columns: [],
			parse: vi.fn()
		});

		const url = new URL('http://localhost/api/sources/regafi?progressOnly=1');
		const response = await GET({ params: { source: 'regafi' }, url } as never);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.success).toBe(false);
	});

	it('returns progress payload when progressRequestId is provided', async () => {
		mockGetSource.mockReturnValue({
			id: 'regafi',
			name: 'Regafi',
			country: 'FR',
			accentColor: 'red',
			uploadFormats: ['json'],
			columns: [],
			parse: vi.fn()
		});
		mockGetDatasetLoadProgress.mockReturnValue({
			requestId: 'req-1',
			kind: 'regafi',
			status: 'running',
			percent: 25,
			message: 'Loading',
			updatedAt: '2026-01-01T00:00:00.000Z'
		});

		const url = new URL('http://localhost/api/sources/regafi?progressOnly=1&progressRequestId=req-1');
		const response = await GET({ params: { source: 'regafi' }, url } as never);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.progress?.requestId).toBe('req-1');
	});
});