import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/compare', () => ({
	compare: vi.fn()
}));

vi.mock('$lib/server/dataset-store', () => ({
	getFilteredEntities: vi.fn()
}));

import { POST } from '../../routes/api/compare/+server';
import { compare } from '$lib/server/compare';
import { getFilteredEntities } from '$lib/server/dataset-store';

const mockCompare = vi.mocked(compare);
const mockGetFilteredEntities = vi.mocked(getFilteredEntities);

describe('POST /api/compare', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 400 when neither dataset ids nor direct arrays are provided', async () => {
		const request = new Request('http://localhost/api/compare', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ left: [], right: null })
		});

		const response = await POST({ request } as never);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.success).toBe(false);
		expect(data.error).toContain('identifiants des datasets');
	});

	it('uses direct in-memory arrays when provided', async () => {
		mockCompare.mockReturnValue({
			matches: [],
			summary: {
				totalMatches: 0,
				totalNameMismatches: 0,
				totalCityMismatches: 0,
				totalCategoryMismatches: 0,
				totalOnlyInLeft: 0,
				totalOnlyInRight: 0,
				totalLeft: 1,
				totalRight: 1
			}
		});

		const left = [{ siren: '1', denomination: 'A', ville: null, pays: null, categorie: null, lei: null, source: 'regafi' }];
		const right = [{ siren: '1', denomination: 'A', ville: null, pays: null, categorie: null, lei: null, source: 'eba' }];

		const request = new Request('http://localhost/api/compare', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ left, right, options: { columns: ['siren'] } })
		});

		const response = await POST({ request } as never);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.success).toBe(true);
		expect(mockCompare).toHaveBeenCalledTimes(1);
		expect(mockCompare).toHaveBeenCalledWith(left, right, { columns: ['siren'] });
	});

	it('loads entities from dataset store when dataset ids are provided', async () => {
		mockGetFilteredEntities
			.mockResolvedValueOnce([
				{ siren: '10', denomination: 'Left', ville: null, pays: null, categorie: null, lei: null, source: 'regafi' }
			])
			.mockResolvedValueOnce([
				{ siren: '10', denomination: 'Right', ville: null, pays: null, categorie: null, lei: null, source: 'eba' }
			]);

		mockCompare.mockReturnValue({
			matches: [],
			summary: {
				totalMatches: 0,
				totalNameMismatches: 0,
				totalCityMismatches: 0,
				totalCategoryMismatches: 0,
				totalOnlyInLeft: 0,
				totalOnlyInRight: 0,
				totalLeft: 1,
				totalRight: 1
			}
		});

		const request = new Request('http://localhost/api/compare', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				leftDatasetId: 'regafi-1-abc',
				rightDatasetId: 'eba-1-def',
				leftSource: 'regafi',
				rightSource: 'eba'
			})
		});

		const response = await POST({ request } as never);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.success).toBe(true);
		expect(mockGetFilteredEntities).toHaveBeenCalledTimes(2);
		expect(mockCompare).toHaveBeenCalledTimes(1);
	});
});