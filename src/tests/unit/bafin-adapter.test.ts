import { describe, expect, it } from 'vitest';
import { parseBafinEntities } from '../../lib/server/sources/bafin-adapter';

describe('parseBafinEntities', () => {
	it('groups continuation rows and normalizes the BAK NR', async () => {
		const csv = [
			'BAK NR;NAME;ORT;LAND;GATTUNG;LEI;ERLAUBNISSE/ZULASSUNG/TÄTIGKEITEN;ERTEILUNGSDATUM;ENDE AM;ENDEGRUND',
			'1302032/BAKNR:148509;First Bank;Berlin;Deutschland;CRR-Kreditinstitut;LEI123;Einlagengeschäft;2020-01-01;;',
			';;;;;;Finanztransfergeschäft;2021-02-02;;'
		].join('\n');

		const entities = await parseBafinEntities({ type: 'csv', text: csv });

		expect(entities).toHaveLength(1);
		expect(entities[0].siren).toBe('148509');
		expect(entities[0].rolesByCountry?.[0]).toMatchObject({
			countryCode: 'DE',
			roles: ['PSP_AS', 'PSP_PI']
		});
		expect(entities[0].extra?.erlaubnisseRaw).toContain('Einlagengeschäft');
		expect(entities[0].extra?.erlaubnisseRaw).toContain('Finanztransfergeschäft');
	});
});