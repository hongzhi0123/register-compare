import { json } from '@sveltejs/kit';
import { compare } from '$lib/server/compare';
import type { ComparisonOptions, NormalizedEntity } from '$lib/types';

export async function POST({ request }) {
	try {
		const body = await request.json();
		const regafi: NormalizedEntity[] | undefined = body.regafi;
		const eba: NormalizedEntity[] | undefined = body.eba;
		const options: Partial<ComparisonOptions> | undefined = body.options;

		if (!regafi || !eba) {
			return json(
				{ success: false, error: 'Les données REGAFI et EBA sont requises' },
				{ status: 400 }
			);
		}

		const result = compare(regafi, eba, options);
		return json({ success: true, ...result });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Erreur inconnue';
		return json({ success: false, error: message }, { status: 500 });
	}
}
