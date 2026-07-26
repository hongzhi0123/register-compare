import { describe, expect, it } from 'vitest';
import { extractRoleFromErlaubnis } from '../../lib/server/sources/bafin-role-map';

describe('extractRoleFromErlaubnis', () => {
	it('requires an allowed GATTUNG for Einlagengeschäft', () => {
		expect(extractRoleFromErlaubnis('Einlagengeschäft mit Einlagen', 'CRR-Kreditinstitut')).toBe('PSP_AS');
		expect(extractRoleFromErlaubnis('Einlagengeschäft mit Einlagen', 'Kreditinstitut')).toBeNull();
	});

	it('maps other permissions directly', () => {
		expect(extractRoleFromErlaubnis('Finanztransfergeschäft')).toBe('PSP_PI');
	});
});