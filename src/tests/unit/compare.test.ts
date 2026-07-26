import { describe, expect, it } from 'vitest';
import { compare } from '../../lib/server/compare';
import type { NormalizedEntity } from '$lib/types';

function makeEntity(partial: Partial<NormalizedEntity> & Pick<NormalizedEntity, 'source'>): NormalizedEntity {
	return {
		siren: '',
		denomination: '',
		ville: null,
		pays: null,
		categorie: null,
		lei: null,
		...partial,
		source: partial.source
	};
}

describe('compare', () => {
	it('matches entities directly by SIREN', () => {
		const left = makeEntity({ siren: '123', denomination: 'Alpha', source: 'regafi' });
		const right = makeEntity({ siren: '123', denomination: 'Alpha Bank', source: 'eba' });

		const result = compare([left], [right], { columns: ['siren'] });

		expect(result.matches).toHaveLength(1);
		expect(result.matches[0].status).toBe('match');
		expect(result.summary).toMatchObject({ totalMatches: 1, totalOnlyInLeft: 0, totalOnlyInRight: 0 });
	});

	it('resolves a right entity through CIB when SIRENs differ', () => {
		const left = makeEntity({ siren: '111', denomination: 'Left', source: 'regafi' });
		const right = makeEntity({ siren: '222', cib: '111', denomination: 'Right', source: 'eba' });

		const result = compare([left], [right], { columns: ['siren'] });

		expect(result.matches).toHaveLength(1);
		expect(result.matches[0].left?.siren).toBe('111');
		expect(result.matches[0].right?.siren).toBe('222');
		expect(result.matches[0].status).toBe('match');
	});

	it('flags a name mismatch when the similarity is below the threshold', () => {
		const left = makeEntity({ siren: '999', denomination: 'Alpha', source: 'regafi' });
		const right = makeEntity({ siren: '999', denomination: 'Beta', source: 'eba' });

		const result = compare([left], [right], { columns: ['siren', 'denomination'], nameSimilarityThreshold: 0.8 });

		expect(result.matches).toHaveLength(1);
		expect(result.matches[0].status).toBe('nameMismatch');
		expect(result.matches[0].differences[0]).toContain('Dénomination');
		expect(result.summary.totalNameMismatches).toBe(1);
	});

	it('merges roles from both sides without duplicates', () => {
		const left = makeEntity({
			siren: '777',
			denomination: 'Role Test',
			source: 'bafin',
			rolesByCountry: [{ countryCode: 'FR', countryName: 'France', roles: ['PSP_PI'] }]
		});
		const right = makeEntity({
			siren: '777',
			denomination: 'Role Test',
			source: 'eba',
			rolesByCountry: [{ countryCode: 'FR', countryName: 'France', roles: ['PSP_PI', 'PSP_AI'] }]
		});

		const result = compare([left], [right], { columns: ['siren'] });

		expect(result.matches[0].rolesDetails).toEqual([
			{ countryCode: 'FR', countryName: 'France', roles: ['PSP_AI', 'PSP_PI'] }
		]);
		expect(result.matches[0].rolesSummary).toBe('PSP_AI, PSP_PI');
	});
});