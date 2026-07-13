import type {
	NormalizedEntity,
	ComparisonMatch,
	ComparisonOptions,
	ComparisonResult,
	CountryRoleDetail,
	CountryRoles
} from '$lib/types';

function normalize(str: string | null): string {
	if (!str) return '';
	return str
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
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

function isCountryRoleDetail(entry: CountryRoles): entry is CountryRoleDetail {
	if (!('countryCode' in entry) || !('countryName' in entry) || !('roles' in entry)) return false;
	return (
		typeof entry.countryCode === 'string' &&
		typeof entry.countryName === 'string' &&
		Array.isArray(entry.roles)
	);
}

function toCountryRoleDetails(entry: CountryRoles): CountryRoleDetail[] {
	if (isCountryRoleDetail(entry)) {
		return [
			{
				countryCode: entry.countryCode,
				countryName: entry.countryName || entry.countryCode,
				roles: entry.roles
			}
		];
	}

	const rows: CountryRoleDetail[] = [];
	for (const [countryCode, roles] of Object.entries(entry)) {
		if (!Array.isArray(roles)) continue;
		rows.push({
			countryCode,
			countryName: countryCode,
			roles: roles.filter(Boolean)
		});
	}
	return rows;
}

function mergeRolesByCountry(left: NormalizedEntity | null, right: NormalizedEntity | null): CountryRoleDetail[] {
	const byCountry = new Map<string, { countryName: string; roles: Set<string> }>();

	const addSource = (source: NormalizedEntity | null) => {
		for (const entry of source?.rolesByCountry ?? []) {
			for (const detail of toCountryRoleDetails(entry)) {
				if (!detail.countryCode) continue;
				if (!byCountry.has(detail.countryCode)) {
					byCountry.set(detail.countryCode, {
						countryName: detail.countryName || detail.countryCode,
						roles: new Set<string>()
					});
				}

				const bucket = byCountry.get(detail.countryCode)!;
				if (!bucket.countryName && detail.countryName) {
					bucket.countryName = detail.countryName;
				}
				for (const role of detail.roles) {
					if (role) bucket.roles.add(role);
				}
			}
		}
	};

	addSource(left);
	addSource(right);

	return Array.from(byCountry.entries())
		.map(([countryCode, value]) => ({
			countryCode,
			countryName: value.countryName || countryCode,
			roles: Array.from(value.roles).sort((a, b) => a.localeCompare(b, 'fr'))
		}))
		.sort((a, b) => a.countryCode.localeCompare(b.countryCode));
}

function summarizeRoles(rolesByCountry: CountryRoleDetail[]): string {
	const uniqueRoles = Array.from(
		new Set(rolesByCountry.flatMap((entry) => entry.roles).filter(Boolean))
	).sort((a, b) => a.localeCompare(b, 'fr'));

	if (uniqueRoles.length === 0) return '';

	const visible = uniqueRoles.slice(0, 3);
	const hiddenCount = uniqueRoles.length - visible.length;
	return hiddenCount > 0 ? `${visible.join(', ')} +${hiddenCount}` : visible.join(', ');
}

function buildMatch(
	siren: string,
	left: NormalizedEntity | null,
	right: NormalizedEntity | null,
	status: ComparisonMatch['status'],
	differences: string[]
): ComparisonMatch {
	const rolesDetails = mergeRolesByCountry(left, right);
	return {
		siren,
		left,
		right,
		status,
		differences,
		rolesDetails,
		rolesSummary: summarizeRoles(rolesDetails)
	};
}

function buildSummary(matches: ComparisonMatch[], leftCount: number, rightCount: number): ComparisonResult['summary'] {
	return {
		totalMatches: matches.filter((m) => m.status === 'match').length,
		totalNameMismatches: matches.filter((m) => m.status === 'nameMismatch').length,
		totalCityMismatches: matches.filter((m) => m.status === 'cityMismatch').length,
		totalCategoryMismatches: matches.filter((m) => m.status === 'categoryMismatch').length,
		totalOnlyInLeft: matches.filter((m) => m.status === 'onlyInLeft').length,
		totalOnlyInRight: matches.filter((m) => m.status === 'onlyInRight').length,
		totalLeft: leftCount,
		totalRight: rightCount
	};
}

export function compare(
	leftEntities: NormalizedEntity[],
	rightEntities: NormalizedEntity[],
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
		const leftBySiren = new Map<string, NormalizedEntity>();
		for (const e of leftEntities) {
			if (e.siren) leftBySiren.set(e.siren, e);
		}

		const rightBySiren = new Map<string, NormalizedEntity>();
		for (const e of rightEntities) {
			if (e.siren) rightBySiren.set(e.siren, e);
		}

		// Build CIB-based lookup for cross-matching (e.g. EBA siren ↔ REGAFI CIB)
		const rightByCib = new Map<string, NormalizedEntity>();
		for (const e of rightEntities) {
			if (e.cib) rightByCib.set(e.cib, e);
		}

		const leftByCib = new Map<string, NormalizedEntity>();
		for (const e of leftEntities) {
			if (e.cib) leftByCib.set(e.cib, e);
		}

		const allSirens = new Set([...leftBySiren.keys(), ...rightBySiren.keys()]);
		const matches: ComparisonMatch[] = [];

		// Track which entities have been matched (by their siren) to avoid duplicates
		const matchedRightSirens = new Set<string>();
		const matchedLeftSirens = new Set<string>();

		// Helper: try to resolve a CIB match for a left entity whose siren matches a right entity's CIB
		function tryResolveRightViaCib(leftSiren: string): NormalizedEntity | null {
			const match = rightByCib.get(leftSiren);
			if (match && match.siren && !matchedRightSirens.has(match.siren)) {
				return match;
			}
			return null;
		}

		// Helper: try to resolve a CIB match for a right entity whose siren matches a left entity's CIB
		function tryResolveLeftViaCib(rightSiren: string): NormalizedEntity | null {
			const match = leftByCib.get(rightSiren);
			if (match && match.siren && !matchedLeftSirens.has(match.siren)) {
				return match;
			}
			return null;
		}

		for (const siren of allSirens) {
			const left = leftBySiren.get(siren) || null;
			const right = rightBySiren.get(siren) || null;

			// Skip if either entity was already matched in a previous iteration
			if (right && right.siren && matchedRightSirens.has(right.siren)) {
				// Right entity already matched elsewhere; only process left if unmatched
				if (left && left.siren && !matchedLeftSirens.has(left.siren)) {
					matchedLeftSirens.add(left.siren);
					matches.push(buildMatch(siren, left, null, 'onlyInLeft', []));
				}
				continue;
			}
			if (left && left.siren && matchedLeftSirens.has(left.siren)) {
				// Left entity already matched elsewhere; only process right if unmatched
				if (right && right.siren && !matchedRightSirens.has(right.siren)) {
					matchedRightSirens.add(right.siren);
					matches.push(buildMatch(siren, null, right, 'onlyInRight', []));
				}
				continue;
			}

			let resolvedLeft = left;
			let resolvedRight = right;
			const differences: string[] = [];

			// Try CIB cross-matching for entities without a direct siren match
			if (resolvedLeft && !resolvedRight) {
				resolvedRight = tryResolveRightViaCib(resolvedLeft.siren);
			}
			if (!resolvedLeft && resolvedRight) {
				resolvedLeft = tryResolveLeftViaCib(resolvedRight.siren);
			}

			if (resolvedLeft && resolvedRight) {
				// Confirm the match (both direct siren and CIB-resolved)
				matchedRightSirens.add(resolvedRight.siren);
				matchedLeftSirens.add(resolvedLeft.siren);

				if (useName) {
					const score = similarity(resolvedLeft.denomination, resolvedRight.denomination);
					if (score < nameSimilarityThreshold) {
						differences.push(
							`Dénomination: "${resolvedLeft.denomination}" (gauche) ≠ "${resolvedRight.denomination}" (droite), similarité ${(score * 100).toFixed(1)}% (< ${(nameSimilarityThreshold * 100).toFixed(0)}%)`
						);
					}
				}

				const status: ComparisonMatch['status'] = differences.length === 0 ? 'match' : 'nameMismatch';
				matches.push(buildMatch(siren, resolvedLeft, resolvedRight, status, differences));
			} else if (resolvedLeft && !resolvedRight) {
				matchedLeftSirens.add(resolvedLeft.siren);
				matches.push(buildMatch(siren, resolvedLeft, null, 'onlyInLeft', []));
			} else if (!resolvedLeft && resolvedRight) {
				matchedRightSirens.add(resolvedRight.siren);
				matches.push(buildMatch(siren, null, resolvedRight, 'onlyInRight', []));
			}
			// else: both null, skip
		}

		// Post-loop: try to match remaining orphans via CIB
		// (entities whose CIB matches the other side's siren, but neither siren was in allSirens)
		let orphanLeft = matches.filter((m) => m.status === 'onlyInLeft');
		let orphanRight = matches.filter((m) => m.status === 'onlyInRight');

		for (const orphan of orphanLeft) {
			if (!orphan.left) continue;
			const rightMatch = tryResolveRightViaCib(orphan.left.siren);
			if (!rightMatch) continue;

			const rightOrphanIndex = orphanRight.findIndex(
				(m) => m.right?.siren === rightMatch.siren
			);
			if (rightOrphanIndex < 0) continue;

			matchedRightSirens.add(rightMatch.siren);
			const diffs: string[] = [];
			if (useName) {
				const score = similarity(orphan.left.denomination, rightMatch.denomination);
				if (score < nameSimilarityThreshold) {
					diffs.push(
						`Dénomination: "${orphan.left.denomination}" (gauche) ≠ "${rightMatch.denomination}" (droite), similarité ${(score * 100).toFixed(1)}% (< ${(nameSimilarityThreshold * 100).toFixed(0)}%)`
					);
				}
			}
			const newStatus: ComparisonMatch['status'] = diffs.length === 0 ? 'match' : 'nameMismatch';

			const leftIdx = matches.indexOf(orphan);
			matches[leftIdx] = buildMatch(orphan.siren, orphan.left, rightMatch, newStatus, diffs);
			matches.splice(rightOrphanIndex, 1);

			// Refresh orphan lists after modification
			orphanLeft = matches.filter((m) => m.status === 'onlyInLeft');
			orphanRight = matches.filter((m) => m.status === 'onlyInRight');
		}

		// Reverse: match remaining onlyInRight via left's CIB
		orphanLeft = matches.filter((m) => m.status === 'onlyInLeft');
		orphanRight = matches.filter((m) => m.status === 'onlyInRight');

		for (const orphan of orphanRight) {
			if (!orphan.right) continue;
			const leftMatch = tryResolveLeftViaCib(orphan.right.siren);
			if (!leftMatch) continue;

			const leftOrphanIndex = orphanLeft.findIndex(
				(m) => m.left?.siren === leftMatch.siren
			);
			if (leftOrphanIndex < 0) continue;

			matchedLeftSirens.add(leftMatch.siren);
			const diffs: string[] = [];
			if (useName) {
				const score = similarity(leftMatch.denomination, orphan.right.denomination);
				if (score < nameSimilarityThreshold) {
					diffs.push(
						`Dénomination: "${leftMatch.denomination}" (gauche) ≠ "${orphan.right.denomination}" (droite), similarité ${(score * 100).toFixed(1)}% (< ${(nameSimilarityThreshold * 100).toFixed(0)}%)`
					);
				}
			}
			const newStatus: ComparisonMatch['status'] = diffs.length === 0 ? 'match' : 'nameMismatch';

			const rightIdx = matches.indexOf(orphan);
			matches[rightIdx] = buildMatch(orphan.siren, leftMatch, orphan.right, newStatus, diffs);
			matches.splice(leftOrphanIndex, 1);

			// Refresh orphan lists
			orphanLeft = matches.filter((m) => m.status === 'onlyInLeft');
			orphanRight = matches.filter((m) => m.status === 'onlyInRight');
		}

		return { matches, summary: buildSummary(matches, leftEntities.length, rightEntities.length) };
	}

	const matches: ComparisonMatch[] = [];
	const usedRightIndexes = new Set<number>();

	for (const leftEntity of leftEntities) {
		let bestIndex = -1;
		let bestScore = -1;

		for (let index = 0; index < rightEntities.length; index += 1) {
			if (usedRightIndexes.has(index)) continue;
			const score = similarity(leftEntity.denomination, rightEntities[index].denomination);
			if (score > bestScore) {
				bestScore = score;
				bestIndex = index;
			}
		}

		if (bestIndex >= 0 && bestScore >= nameSimilarityThreshold) {
			usedRightIndexes.add(bestIndex);
			const rightEntity = rightEntities[bestIndex];
			matches.push(
				buildMatch(leftEntity.siren || rightEntity.siren, leftEntity, rightEntity, 'match', [])
			);
			continue;
		}

		matches.push(
			buildMatch(leftEntity.siren, leftEntity, null, 'onlyInLeft', [
				`Aucune dénomination droite avec une similarité >= ${(nameSimilarityThreshold * 100).toFixed(0)}%`
			])
		);
	}

	for (let index = 0; index < rightEntities.length; index += 1) {
		if (usedRightIndexes.has(index)) continue;
		const rightEntity = rightEntities[index];
		matches.push(
			buildMatch(rightEntity.siren, null, rightEntity, 'onlyInRight', [
				`Aucune dénomination gauche avec une similarité >= ${(nameSimilarityThreshold * 100).toFixed(0)}%`
			])
		);
	}

	return { matches, summary: buildSummary(matches, leftEntities.length, rightEntities.length) };
}
