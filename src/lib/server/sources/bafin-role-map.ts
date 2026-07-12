export const BAFIN_TO_PSD2: Record<string, string[]> = {
	'Einlagengeschäft': ['PSP_AS'],
	// 'Depotgeschäft': ['PSP_AS'],
	'Scheck- u. Wechseleinzugs- u. Reisescheckgeschäft': ['PSP_PI'],
	'Finanztransfergeschäft': ['PSP_PI'],
	'Kreditkartengeschäft': ['PSP_PI'],
	'Geldkartengeschäft': ['PSP_PI'],
	'Girogeschäft': ['PSP_PI'],
	'E-Geld-Geschäft': ['PSP_EMI'],
	'Zahlungsdienste': ['PSP_PI']
};

const PSP_AS_GATTUNGEN = new Set(['CRR-Kreditinstitut', 'SSM-Institut']);

export function extractRoleFromErlaubnis(erlaubnis: string, gattung?: string): string | null {
	const normalized = erlaubnis.trim();
	for (const [key, roles] of Object.entries(BAFIN_TO_PSD2)) {
		if (normalized.includes(key)) {
			// Einlagengeschäft only confers PSP_AS when the company is
			// also classified as CRR-Kreditinstitut or SSM-Institut.
			// GATTUNG can be a comma-separated list, e.g. "CRR-Kreditinstitut, Kreditinstitut, SSM-Institut"
			if (key === 'Einlagengeschäft') {
				const hasRequiredGattung = gattung
					?.split(',')
					.some((g) => PSP_AS_GATTUNGEN.has(g.trim()));
				if (!hasRequiredGattung) {
					return null;
				}
			}
			return roles[0];
		}
	}
	return null;
}
