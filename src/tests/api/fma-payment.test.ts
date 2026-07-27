import { beforeEach, describe, vi } from 'vitest';

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
import { registerSourceImportTests, resolveSamplePath } from './helpers/source-import-test-helpers';

const mockPersistDataset = vi.mocked(persistDataset);

const SAMPLE_FMA_PAYMENT = resolveSamplePath('../../../samples/fma_payments.csv', import.meta.url);

describe('POST /api/sources/fma-payment', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPersistDataset.mockResolvedValue({ datasetId: 'fma-payment-test', count: 0 });
	});

	registerSourceImportTests({
		sourceId: 'fma-payment',
		sampleFileLabel: 'fma_payments.csv',
		sampleFilePath: SAMPLE_FMA_PAYMENT,
		datasetId: 'fma-payment-test',
		post: POST,
		mockPersistDataset
	});
});
