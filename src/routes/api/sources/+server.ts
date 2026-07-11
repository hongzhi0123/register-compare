import { json } from '@sveltejs/kit';
import { getAllSources } from '$lib/server/sources/registry';

export function GET() {
	const sources = getAllSources().map((s) => ({
		id: s.id,
		name: s.name,
		country: s.country,
		accentColor: s.accentColor,
		uploadFormats: s.uploadFormats,
		columns: s.columns
	}));

	return json(sources);
}
