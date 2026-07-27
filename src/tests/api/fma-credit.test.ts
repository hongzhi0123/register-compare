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

const SAMPLE_FMA_CREDIT = resolveSamplePath('../../../samples/fma_credits.csv', import.meta.url);

describe('POST /api/sources/fma-credit', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPersistDataset.mockResolvedValue({ datasetId: 'fma-credit-test', count: 0 });
	});

	registerSourceImportTests({
		sourceId: 'fma-credit',
		sampleFileLabel: 'fma_credits.csv',
		sampleFilePath: SAMPLE_FMA_CREDIT,
		datasetId: 'fma-credit-test',
		post: POST,
		mockPersistDataset
	});
});
