import { json } from '@sveltejs/kit';
import { compare } from '$lib/server/compare';
import { getFilteredEntities, type DatasetColumnKey } from '$lib/server/dataset-store';
import type { ComparisonOptions, NormalizedEntity } from '$lib/types';

export async function POST({ request }) {
	try {
		const body = await request.json();
		const {
			ebaDatasetId,
			regafiDatasetId,
			ebaTextFilters = {},
			ebaSelectFilters = {},
			regafiTextFilters = {},
			regafiSelectFilters = {},
			options = {} as Partial<ComparisonOptions>,
			eba: ebaInput,
			regafi: regafiInput
		} = body;

		let ebaEntities: NormalizedEntity[];
		let regafiEntities: NormalizedEntity[];

		if (ebaDatasetId && regafiDatasetId) {
			[ebaEntities, regafiEntities] = await Promise.all([
				getFilteredEntities(
					'eba',
					ebaDatasetId,
					ebaTextFilters as Partial<Record<DatasetColumnKey, string>>,
					ebaSelectFilters as Partial<Record<DatasetColumnKey, string[]>>,
					'none',
					'asc'
				),
				getFilteredEntities(
					'regafi',
					regafiDatasetId,
					regafiTextFilters as Partial<Record<DatasetColumnKey, string>>,
					regafiSelectFilters as Partial<Record<DatasetColumnKey, string[]>>,
					'none',
					'asc'
				)
			]);
		} else if (Array.isArray(ebaInput) && Array.isArray(regafiInput)) {
			ebaEntities = ebaInput;
			regafiEntities = regafiInput;
		} else {
			return json(
				{ success: false, error: 'Fournissez les identifiants des datasets ou les données directement' },
				{ status: 400 }
			);
		}

		const result = compare(regafiEntities, ebaEntities, options);
		return json({ success: true, ...result });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Erreur inconnue';
		return json({ success: false, error: message }, { status: 500 });
	}
}
