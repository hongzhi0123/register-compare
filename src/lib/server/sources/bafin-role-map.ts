export const BAFIN_TO_PSD2: Record<string, string[]> = {
	'Finanztransfergeschäft': ['PSP_PI'],
	'Girogeschäft': ['PSP_PI'],
	'Kreditkartengeschäft': ['PSP_PI'],
	'Geldkartengeschäft': ['PSP_PI'],
	'E-Geld-Geschäft': ['PSP_EMI'],
	'Zahlungsdienste': ['PSP_PI'],
	'Scheck- u. Wechseleinzugs- u. Reisescheckgeschäft': ['PSP_PI']
};

export function extractRoleFromErlaubnis(erlaubnis: string): string | null {
	const normalized = erlaubnis.trim();
	for (const [key, roles] of Object.entries(BAFIN_TO_PSD2)) {
		if (normalized.includes(key)) {
			return roles[0];
		}
	}
	return null;
}
