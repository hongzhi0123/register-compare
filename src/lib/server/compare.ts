import type { NormalizedEntity, ComparisonMatch, ComparisonOptions, ComparisonResult } from '$lib/types';

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

function levenshteinDistance(a: string, b: string): number {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;

	const dp: number[] = Array.from({ length: b.length + 1 }, (_, index) => index);

	for (let i = 1; i <= a.length; i += 1) {
		let previous = dp[0];
		dp[0] = i;
		for (let j = 1; j <= b.length; j += 1) {
			const temp = dp[j];
			const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
			dp[j] = Math.min(
				dp[j] + 1,
				dp[j - 1] + 1,
				previous + substitutionCost
			);
			previous = temp;
		}
	}

	return dp[b.length];
}

function similarity(a: string | null, b: string | null): number {
	const left = normalize(a);
	const right = normalize(b);
	if (!left && !right) return 1;
	if (!left || !right) return 0;

	const distance = levenshteinDistance(left, right);
	const maxLength = Math.max(left.length, right.length);
	return maxLength === 0 ? 1 : 1 - distance / maxLength;
}

function clampThreshold(value: number): number {
	if (!Number.isFinite(value)) return 0.8;
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
}

function buildSummary(matches: ComparisonMatch[], regafiCount: number, ebaCount: number): ComparisonResult['summary'] {
	return {
		totalMatches: matches.filter((m) => m.status === 'match').length,
		totalNameMismatches: matches.filter((m) => m.status === 'nameMismatch').length,
		totalCityMismatches: matches.filter((m) => m.status === 'cityMismatch').length,
		totalCategoryMismatches: matches.filter((m) => m.status === 'categoryMismatch').length,
		totalOnlyInRegafi: matches.filter((m) => m.status === 'onlyInRegafi').length,
		totalOnlyInEba: matches.filter((m) => m.status === 'onlyInEba').length,
		totalRegafi: regafiCount,
		totalEba: ebaCount
	};
}

export function compare(
	regafiEntities: NormalizedEntity[],
	ebaEntities: NormalizedEntity[],
	options?: Partial<ComparisonOptions>
): ComparisonResult {
	const columns = new Set(options?.columns ?? ['siren', 'denomination']);
	const useSiren = columns.has('siren');
	const useName = columns.has('denomination');
	const nameSimilarityThreshold = clampThreshold(options?.nameSimilarityThreshold ?? 0.8);

	if (!useSiren && !useName) {
		throw new Error('Aucune colonne de comparaison sélectionnée');
	}

	if (useSiren) {
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
			if (useName) {
				const score = similarity(regafi.denomination, eba.denomination);
				if (score < nameSimilarityThreshold) {
					differences.push(
						`Dénomination: "${regafi.denomination}" (REGAFI) ≠ "${eba.denomination}" (EBA), similarité ${(score * 100).toFixed(1)}% (< ${(nameSimilarityThreshold * 100).toFixed(0)}%)`
					);
				}
			}

			if (differences.length === 0) {
				status = 'match';
			} else if (differences.some((d) => d.startsWith('Dénomination'))) {
				status = 'nameMismatch';
			} else {
				status = 'nameMismatch';
			}
		} else {
			continue;
		}

		matches.push({ siren, regafi, eba, status, differences });
	}

	return { matches, summary: buildSummary(matches, regafiEntities.length, ebaEntities.length) };
	}

	const matches: ComparisonMatch[] = [];
	const usedEbaIndexes = new Set<number>();

	for (const regafiEntity of regafiEntities) {
		let bestIndex = -1;
		let bestScore = -1;

		for (let index = 0; index < ebaEntities.length; index += 1) {
			if (usedEbaIndexes.has(index)) continue;
			const score = similarity(regafiEntity.denomination, ebaEntities[index].denomination);
			if (score > bestScore) {
				bestScore = score;
				bestIndex = index;
			}
		}

		if (bestIndex >= 0 && bestScore >= nameSimilarityThreshold) {
			usedEbaIndexes.add(bestIndex);
			const ebaEntity = ebaEntities[bestIndex];
			matches.push({
				siren: regafiEntity.siren || ebaEntity.siren,
				regafi: regafiEntity,
				eba: ebaEntity,
				status: 'match',
				differences: []
			});
			continue;
		}

		matches.push({
			siren: regafiEntity.siren,
			regafi: regafiEntity,
			eba: null,
			status: 'onlyInRegafi',
			differences: [
				`Aucune dénomination EBA avec une similarité >= ${(nameSimilarityThreshold * 100).toFixed(0)}%`
			]
		});
	}

	for (let index = 0; index < ebaEntities.length; index += 1) {
		if (usedEbaIndexes.has(index)) continue;
		const ebaEntity = ebaEntities[index];
		matches.push({
			siren: ebaEntity.siren,
			regafi: null,
			eba: ebaEntity,
			status: 'onlyInEba',
			differences: [
				`Aucune dénomination REGAFI avec une similarité >= ${(nameSimilarityThreshold * 100).toFixed(0)}%`
			]
		});
	}

	return { matches, summary: buildSummary(matches, regafiEntities.length, ebaEntities.length) };
}
