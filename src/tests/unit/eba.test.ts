import { describe, expect, it } from 'vitest';
import { parseEbaPayload } from '../../lib/server/eba';

describe('parseEbaPayload', () => {
	it('extracts a nested entity and normalizes the comparable id', () => {
		const payload = {
			meta: { ignored: true },
			branch: {
				company_id: '8410551/BAKNR:105658',
				denomination: 'EBA Test Bank',
				ville: 'Paris',
				country: 'France',
				activity: ['credit', 'payment'],
				lei: 'LEI-9',
				reference_id: 'REF-9',
				cib: 'CIB-9',
				entity_type: 'credit',
				Services: [{ country: 'FR', role: 7 }]
			}
		};

		const entities = parseEbaPayload(payload);

		expect(entities).toHaveLength(1);
		expect(entities[0].siren).toBe('105658');
		expect(entities[0].categorie).toBe('credit, payment');
		expect(entities[0].rolesByCountry).toEqual([
			{ FR: ['Payment initiation (PISP)'] }
		]);
	});
});