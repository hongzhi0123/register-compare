import { json } from '@sveltejs/kit';
import { compare } from '$lib/server/compare';
import { getFilteredEntities } from '$lib/server/dataset-store';
import type { ComparisonOptions, NormalizedEntity, SourceId } from '$lib/types';

export async function POST({ request }) {
	try {
		const body = await request.json();
		const {
			leftDatasetId,
			rightDatasetId,
			leftSource = 'regafi',
			rightSource = 'eba',
			leftTextFilters = {},
			leftSelectFilters = {},
			rightTextFilters = {},
			rightSelectFilters = {},
			options = {} as Partial<ComparisonOptions>,
			left: leftInput,
			right: rightInput
		} = body;

		let leftEntities: NormalizedEntity[];
		let rightEntities: NormalizedEntity[];

		if (leftDatasetId && rightDatasetId) {
			[leftEntities, rightEntities] = await Promise.all([
				getFilteredEntities(
					leftSource as SourceId,
					leftDatasetId,
					leftTextFilters as Record<string, string>,
					leftSelectFilters as Record<string, string[]>,
					'none',
					'asc'
				),
				getFilteredEntities(
					rightSource as SourceId,
					rightDatasetId,
					rightTextFilters as Record<string, string>,
					rightSelectFilters as Record<string, string[]>,
					'none',
					'asc'
				)
			]);
		} else if (Array.isArray(leftInput) && Array.isArray(rightInput)) {
			leftEntities = leftInput;
			rightEntities = rightInput;
		} else {
			return json(
				{ success: false, error: 'Fournissez les identifiants des datasets ou les données directement' },
				{ status: 400 }
			);
		}

		const result = compare(leftEntities, rightEntities, options);
		return json({ success: true, ...result });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Erreur inconnue';
		return json({ success: false, error: message }, { status: 500 });
	}
}
