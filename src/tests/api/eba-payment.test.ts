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
import { registerSourceImportTests, resolveSamplePath } from './helpers/source-import-test-helpers';

const mockPersistDataset = vi.mocked(persistDataset);

// Sample files are resolved relative to this test file.
// To add more test cases, place additional JSON files next to these
// and create new `it` blocks pointing to them.
const SAMPLE_EBA_PAYMENT = resolveSamplePath('../../../samples/eba_payments.json', import.meta.url);

describe('POST /api/sources/eba-payment', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPersistDataset.mockResolvedValue({ datasetId: 'eba-payment-test', count: 0 });
	});

	registerSourceImportTests({
		sourceId: 'eba-payment',
		sampleFileLabel: 'eba_payments.json',
		sampleFilePath: SAMPLE_EBA_PAYMENT,
		datasetId: 'eba-payment-test',
		post: POST,
		mockPersistDataset
	});
});
