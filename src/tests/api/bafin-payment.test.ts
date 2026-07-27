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

// Sample files are resolved relative to this test file.
// To add more test cases, place additional CSV files next to these
// and create new `it` blocks pointing to them.
const SAMPLE_BAFIN_PAYMENT = resolveSamplePath('../../../samples/bafin_payments.csv', import.meta.url);

describe('POST /api/sources/bafin-payment', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPersistDataset.mockResolvedValue({ datasetId: 'bafin-payment-test', count: 0 });
	});

	registerSourceImportTests({
		sourceId: 'bafin-payment',
		sampleFileLabel: 'bafin_payments.csv',
		sampleFilePath: SAMPLE_BAFIN_PAYMENT,
		datasetId: 'bafin-payment-test',
		minExpectedCount: 0,
		post: POST,
		mockPersistDataset
	});
});
