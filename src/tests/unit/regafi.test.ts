import { describe, expect, it } from 'vitest';
import { keepFrenchEntities, normalizeRegafiEntity, parseRegafiJson } from '../../lib/server/regafi';
import type { RegafiRecord } from '$lib/types';

describe('regafi normalization', () => {
	it('normalizes a record payload and extracts role countries', () => {
		const record: RegafiRecord = {
			id: 1,
			datasetid: 'catalogue-banque',
			recordid: '1',
			fields: {
				id_referentiel: 'REF-1',
				cib: JSON.stringify([{ code: '12448', date: '1993-06-30' }]),
				lei: 'LEI-1',
				indicateur_psi: null,
				type_entite: null,
				denomination: 'Banque Test',
				nom_commerciaux: null,
				sigle: null,
				siren: '123456789',
				forme_juridique: null,
				id_entite_parente: null,
				modalite_exercice: null,
				adresse: null,
				code_postal: null,
				ville: 'Paris',
				pays: 'France',
				categorie: 'Catégorie',
				evenements: null,
				approval_withdrawal_process: null,
				authorisations: JSON.stringify([{ pays: 'France', services_paiement_json: { 7: true } }]),
				mandants: null,
				mandataires: null,
				passports_sortants: JSON.stringify([{ pays_exercice: 'Germany', services_paiement_json: { 8: true } }]),
				passports_entrants: null
			},
			geometry: null,
			record_timestamp: '2026-01-01T00:00:00Z'
		};

		const entity = normalizeRegafiEntity(record);

		expect(entity.siren).toBe('123456789');
		expect(entity.pays).toBe('FRANCE');
		expect(entity.cib).toBe('12448');
		expect(entity.rolesByCountry).toEqual([
			{ countryCode: 'FR', countryName: 'FRANCE', roles: ['PSP_PI'] },
			{ countryCode: 'GERMANY', countryName: 'GERMANY', roles: ['PSP_AI'] }
		]);
	});

	it('keeps only French entities', () => {
		const parsed = parseRegafiJson(JSON.stringify([
			{ siren: '1', denomination: 'French', pays: 'France' },
			{ siren: '2', denomination: 'Other', pays: 'Germany' }
		]));

		expect(keepFrenchEntities(parsed).map((entity) => entity.siren)).toEqual(['1']);
	});
});