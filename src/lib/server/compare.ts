import type { NormalizedEntity, ComparisonMatch, ComparisonResult } from '$lib/types';

function normalize(str: string | null): string {
	if (!str) return '';
	return str
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function eq(a: string | null, b: string | null): boolean {
	return normalize(a) === normalize(b);
}

export function compare(
	regafiEntities: NormalizedEntity[],
	ebaEntities: NormalizedEntity[]
): ComparisonResult {
	const regafiBySiren = new Map<string, NormalizedEntity>();
	for (const e of regafiEntities) {
		if (e.siren) regafiBySiren.set(e.siren, e);
	}

	const ebaBySiren = new Map<string, NormalizedEntity>();
	for (const e of ebaEntities) {
		if (e.siren) ebaBySiren.set(e.siren, e);
	}

	const allSirens = new Set([...regafiBySiren.keys(), ...ebaBySiren.keys()]);
	const matches: ComparisonMatch[] = [];

	for (const siren of allSirens) {
		const regafi = regafiBySiren.get(siren) || null;
		const eba = ebaBySiren.get(siren) || null;

		let status: ComparisonMatch['status'];
		const differences: string[] = [];

		if (regafi && !eba) {
			status = 'onlyInRegafi';
		} else if (!regafi && eba) {
			status = 'onlyInEba';
		} else if (regafi && eba) {
			if (!eq(regafi.denomination, eba.denomination)) {
				differences.push(
					`Dénomination: "${regafi.denomination}" (REGAFI) ≠ "${eba.denomination}" (EBA)`
				);
			}
			if (!eq(regafi.ville, eba.ville)) {
				differences.push(
					`Ville: "${regafi.ville}" (REGAFI) ≠ "${eba.ville}" (EBA)`
				);
			}
			if (!eq(regafi.categorie, eba.categorie)) {
				differences.push(
					`Catégorie: "${regafi.categorie}" (REGAFI) ≠ "${eba.categorie}" (EBA)`
				);
			}

			if (differences.length === 0) {
				status = 'match';
			} else if (differences.some((d) => d.startsWith('Dénomination'))) {
				status = 'nameMismatch';
			} else if (differences.some((d) => d.startsWith('Ville'))) {
				status = 'cityMismatch';
			} else {
				status = 'categoryMismatch';
			}
		} else {
			continue;
		}

		matches.push({ siren, regafi, eba, status, differences });
	}

	const summary = {
		totalMatches: matches.filter((m) => m.status === 'match').length,
		totalNameMismatches: matches.filter((m) => m.status === 'nameMismatch').length,
		totalCityMismatches: matches.filter((m) => m.status === 'cityMismatch').length,
		totalCategoryMismatches: matches.filter((m) => m.status === 'categoryMismatch').length,
		totalOnlyInRegafi: matches.filter((m) => m.status === 'onlyInRegafi').length,
		totalOnlyInEba: matches.filter((m) => m.status === 'onlyInEba').length,
		totalRegafi: regafiEntities.length,
		totalEba: ebaEntities.length
	};

	return { matches, summary };
}
