import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/dataset-store', () => ({
	getDatasetLoadProgress: vi.fn(),
	getDatasetPage: vi.fn(),
	getLatestDatasetPage: vi.fn(),
	persistDataset: vi.fn(),
	getFilteredEntities: vi.fn(),
	entitiesToCsv: vi.fn()
}));

import { POST } from '../../routes/api/sources/[source]/+server';
import { persistDataset } from '$lib/server/dataset-store';
import { resolveSamplePath } from './helpers/source-import-test-helpers';

const mockPersistDataset = vi.mocked(persistDataset);
const SAMPLE_REGAFI = resolveSamplePath('../../../samples/regafi.json', import.meta.url);

function makeRegafiRequest(sourceId: string): Request {
	const body = readFileSync(SAMPLE_REGAFI, 'utf-8');
	return new Request(`http://localhost/api/sources/${sourceId}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body
	});
}

const regafiVariants = [
	{ sourceId: 'regafi-credit', datasetId: 'regafi-credit-test' },
	{ sourceId: 'regafi-payment', datasetId: 'regafi-payment-test' }
] as const;

describe('POST /api/sources/regafi variants', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	for (const variant of regafiVariants) {
		it(`handles ${variant.sourceId} import`, async () => {
			mockPersistDataset.mockImplementation(async (_sourceId, entities) => ({
				datasetId: variant.datasetId,
				count: entities.length
			}));

			const request = makeRegafiRequest(variant.sourceId);
			const response = await POST({ params: { source: variant.sourceId }, request } as never);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.count).toBeGreaterThan(0);

			expect(mockPersistDataset).toHaveBeenCalledOnce();
			const [calledSourceId, entities] = mockPersistDataset.mock.calls[0];
			expect(calledSourceId).toBe(variant.sourceId);
			expect(entities.length).toBeGreaterThan(0);
			for (const entity of entities) {
				expect(entity.source).toBe(variant.sourceId);
			}
		});
	}
});
