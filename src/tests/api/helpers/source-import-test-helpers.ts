import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import type { NormalizedEntity } from '$lib/types';

type SourcePostHandler = (event: { params: { source: string }; request: Request }) => Promise<Response>;

type PersistDatasetCall = [string, NormalizedEntity[]];

type PersistDatasetMock = {
	mockImplementation: (
		fn: (sourceId: string, entities: NormalizedEntity[]) => Promise<{ datasetId: string; count: number }>
	) => unknown;
	mock: {
		calls: PersistDatasetCall[];
	};
};

export type SourceImportTestConfig = {
	sourceId: string;
	sampleFileLabel: string;
	sampleFilePath: string;
	datasetId: string;
	minExpectedCount?: number;
	post: SourcePostHandler;
	mockPersistDataset: PersistDatasetMock;
};

export function resolveSamplePath(relativePathFromTest: string, testFileImportMetaUrl: string): string {
	return fileURLToPath(new URL(relativePathFromTest, testFileImportMetaUrl));
}

/** Wraps a file's raw bytes in a single-chunk Web ReadableStream. */
export function fileToStream(filePath: string): ReadableStream<Uint8Array> {
	const buffer = readFileSync(filePath);
	return new ReadableStream({
		start(controller) {
			controller.enqueue(new Uint8Array(buffer));
			controller.close();
		}
	});
}

/** Builds a POST request whose body is the raw content of a file. */
export function makeSourceImportRequest(sourceId: string, filePath: string): Request {
	return new Request(`http://localhost/api/sources/${sourceId}`, {
		method: 'POST',
		body: fileToStream(filePath),
		// Required by the Fetch spec when the body is a ReadableStream
		// @ts-expect-error duplex is not in the RequestInit types but is needed in Node 18+
		duplex: 'half'
	});
}

export function registerSourceImportTests(config: SourceImportTestConfig): void {
	const {
		sourceId,
		sampleFileLabel,
		sampleFilePath,
		datasetId,
		minExpectedCount = 1,
		post,
		mockPersistDataset
	} = config;

	it(`parses ${sampleFileLabel} and returns success`, async () => {
		mockPersistDataset.mockImplementation(async (_calledSourceId, entities) => ({
			datasetId,
			count: entities.length
		}));

		const request = makeSourceImportRequest(sourceId, sampleFilePath);
		const response = await post({ params: { source: sourceId }, request } as never);
		const data = (await response.json()) as { success: boolean; count: number };

		expect(response.status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.count).toBeGreaterThanOrEqual(minExpectedCount);
	});

	it(`calls persistDataset with source id "${sourceId}" and the parsed entities`, async () => {
		mockPersistDataset.mockImplementation(async (_calledSourceId, entities) => ({
			datasetId,
			count: entities.length
		}));

		const request = makeSourceImportRequest(sourceId, sampleFilePath);
		await post({ params: { source: sourceId }, request } as never);

		expect(mockPersistDataset).toHaveBeenCalledOnce();
		const [calledSourceId, entities] = mockPersistDataset.mock.calls[0];
		expect(calledSourceId).toBe(sourceId);
		expect(Array.isArray(entities)).toBe(true);
		expect(entities.length).toBeGreaterThanOrEqual(minExpectedCount);
	});

	it(`every parsed entity carries source label "${sourceId}"`, async () => {
		mockPersistDataset.mockImplementation(async (_calledSourceId, entities) => ({
			datasetId,
			count: entities.length
		}));

		const request = makeSourceImportRequest(sourceId, sampleFilePath);
		await post({ params: { source: sourceId }, request } as never);

		const [, entities] = mockPersistDataset.mock.calls[0];
		for (const entity of entities) {
			expect(entity.source).toBe(sourceId);
		}
	});

	it('every parsed entity has the expected NormalizedEntity shape', async () => {
		mockPersistDataset.mockImplementation(async (_calledSourceId, entities) => ({
			datasetId,
			count: entities.length
		}));

		const request = makeSourceImportRequest(sourceId, sampleFilePath);
		await post({ params: { source: sourceId }, request } as never);

		const [, entities] = mockPersistDataset.mock.calls[0];
		for (const entity of entities) {
			expect(entity).toHaveProperty('siren');
			expect(entity).toHaveProperty('denomination');
			expect(entity).toHaveProperty('pays');
			expect(entity).toHaveProperty('categorie');
			expect(entity).toHaveProperty('source', sourceId);
			if ('rolesByCountry' in entity) {
				expect(entity).toHaveProperty('rolesByCountry');
			}
		}
	});
}
