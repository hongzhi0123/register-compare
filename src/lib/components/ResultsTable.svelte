<script lang="ts">
	import type { ComparisonMatch } from '$lib/types';

	let { matches, leftLabel = 'Gauche', rightLabel = 'Droite' } = $props<{
		matches: ComparisonMatch[];
		leftLabel?: string;
		rightLabel?: string;
	}>();

	let search = $state('');
	let statusFilter = $state<string>('all');
	let expanded = $state<Set<string>>(new Set());

	const filtered = $derived(
		matches.filter((m: ComparisonMatch) => {
			if (statusFilter !== 'all' && m.status !== statusFilter) return false;
			if (search) {
				const q = search.toLowerCase();
				const l = m.left?.denomination.toLowerCase() || '';
				const r = m.right?.denomination.toLowerCase() || '';
				if (!l.includes(q) && !r.includes(q) && !m.siren.includes(q)) return false;
			}
			return true;
		})
	);

	const statusLabels: Record<string, string> = {
		match: 'Match',
		nameMismatch: 'Name mismatch',
		cityMismatch: 'City mismatch',
		categoryMismatch: 'Category mismatch',
		onlyInLeft: `Uniquement ${leftLabel}`,
		onlyInRight: `Uniquement ${rightLabel}`
	};

	const statusColors: Record<string, string> = {
		match: 'bg-green-100 text-green-800',
		nameMismatch: 'bg-amber-100 text-amber-800',
		cityMismatch: 'bg-amber-100 text-amber-800',
		categoryMismatch: 'bg-amber-100 text-amber-800',
		onlyInLeft: 'bg-red-100 text-red-800',
		onlyInRight: 'bg-purple-100 text-purple-800'
	};

	function escapeCsv(value: string | null | undefined): string {
		const normalized = value ?? '';
		const escaped = normalized.replace(/"/g, '""');
		return `"${escaped}"`;
	}

	function exportFilteredToCsv() {
		const header = ['Statut', 'SIREN', 'Denomination', 'Categorie', 'Roles PSD2', 'Ville', 'Differences'];
		const rows = filtered.map((match: ComparisonMatch) => {
			const denomination = match.left?.denomination || match.right?.denomination || '';
			const categorie = match.left?.categorie || match.right?.categorie || '';
			const roles = match.rolesSummary || '';
			const ville = match.left?.ville || match.right?.ville || '';
			const differences = match.differences.join(' | ');

			return [
				escapeCsv(statusLabels[match.status] || match.status),
				escapeCsv(match.siren),
				escapeCsv(denomination),
				escapeCsv(categorie),
				escapeCsv(roles),
				escapeCsv(ville),
				escapeCsv(differences)
			].join(',');
		});

		const csvContent = [header.map((h) => escapeCsv(h)).join(','), ...rows].join('\n');
		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
		link.href = url;
		link.download = `comparison-results-${timestamp}.csv`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}

	function toggleExpand(siren: string) {
		if (expanded.has(siren)) {
			expanded.delete(siren);
		} else {
			expanded.add(siren);
		}
		expanded = new Set(expanded);
	}

	function formatRolesByCountry(match: ComparisonMatch): string {
		const details = match.rolesDetails ?? [];
		if (details.length === 0) return '-';
		return details
			.filter((entry) => entry.roles.length > 0)
			.map((entry) => `${entry.countryName}: ${entry.roles.join(', ')}`)
			.join(' | ');
	}

	function isDetailedRoleEntry(entry: unknown): entry is { countryCode: string; countryName: string; roles: string[] } {
		if (!entry || typeof entry !== 'object') return false;
		const record = entry as Record<string, unknown>;
		return (
			typeof record.countryCode === 'string' &&
			typeof record.countryName === 'string' &&
			Array.isArray(record.roles)
		);
	}

	function formatEntityRolesByCountry(entityRoles: ComparisonMatch['rolesDetails'] | Array<Record<string, string[]>> | undefined): string {
		if (!entityRoles || entityRoles.length === 0) return '-';
		const rows: Array<{ country: string; roles: string[] }> = [];
		for (const entry of entityRoles) {
			if (isDetailedRoleEntry(entry)) {
				rows.push({ country: entry.countryName || entry.countryCode, roles: entry.roles });
				continue;
			}
			for (const [country, roles] of Object.entries(entry)) {
				if (!Array.isArray(roles) || roles.length === 0) continue;
				rows.push({ country, roles });
			}
		}
		if (rows.length === 0) return '-';
		return rows.map((row) => `${row.country}: ${row.roles.join(', ')}`).join(' | ');
	}
</script>

<div class="space-y-4">
	<div class="flex flex-col lg:flex-row gap-3 lg:items-center">
		<input
			type="text"
			placeholder="Search by name or SIREN..."
			class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
			bind:value={search}
		/>

		<div class="flex flex-col sm:flex-row gap-3">
			<select
				class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
				bind:value={statusFilter}
			>
				<option value="all">All statuses</option>
				<option value="match">Matches</option>
				<option value="nameMismatch">Name mismatches</option>
				<option value="cityMismatch">City mismatches</option>
				<option value="categoryMismatch">Category mismatches</option>
				<option value="onlyInLeft">Only in {leftLabel}</option>
				<option value="onlyInRight">Only in {rightLabel}</option>
			</select>

			<button
				type="button"
				class="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
				onclick={exportFilteredToCsv}
				disabled={filtered.length === 0}
			>
				Export ({filtered.length})
			</button>
		</div>
	</div>

	<div class="text-sm text-gray-500">
		{filtered.length} / {matches.length} results
	</div>

	<div>
		<table class="w-full table-fixed divide-y divide-gray-200 text-sm">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Statut</th>
					<th class="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">SIREN</th>
					<th class="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Denomination</th>
					<th class="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Categorie</th>
					<th class="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Roles PSD2</th>
					<th class="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Ville</th>
					<th class="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Details</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#each filtered as match}
					<tr class="hover:bg-gray-50 cursor-pointer" onclick={() => toggleExpand(match.siren)}>
						<td class="px-4 py-3 truncate">
							<span class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full {statusColors[match.status]}">
								{statusLabels[match.status]}
							</span>
						</td>
						<td class="px-4 py-3 truncate font-mono text-xs">{match.siren}</td>
						<td class="px-4 py-3">
							<div class="text-gray-900">{match.left?.denomination || match.right?.denomination || '-'}</div>
						</td>
						<td class="px-4 py-3 truncate">{match.left?.categorie || match.right?.categorie || '-'}</td>
						<td class="px-4 py-3 max-w-xs">
							<div class="text-gray-900 truncate" title={formatRolesByCountry(match)}>
								{match.rolesSummary || '-'}
							</div>
						</td>
						<td class="px-4 py-3 truncate">{match.left?.ville || match.right?.ville || '-'}</td>
						<td class="px-4 py-3">
							<button class="text-blue-600 hover:text-blue-800 text-xs font-medium">
								{expanded.has(match.siren) ? 'Masquer' : 'Voir'}
							</button>
						</td>
					</tr>
					{#if expanded.has(match.siren)}
						<tr class="bg-gray-50">
							<td colspan="7" class="px-4 py-3">
								{#if match.differences.length > 0}
									<div class="space-y-1">
										<p class="text-xs font-medium text-gray-500 mb-1">Differences:</p>
										{#each match.differences as diff}
											<p class="text-sm text-amber-700 bg-amber-50 px-2 py-1 rounded">{diff}</p>
										{/each}
									</div>
								{/if}
								<div class="mt-2 bg-gray-100 p-2 rounded text-xs">
									<p class="font-medium text-gray-700 mb-1">PSD2 roles by country</p>
									{#if (match.rolesDetails ?? []).length > 0}
										<div class="space-y-1">
											{#each match.rolesDetails ?? [] as entry}
												<p>
													<span class="font-medium">{entry.countryName}:</span>
													{entry.roles.length > 0 ? ` ${entry.roles.join(', ')}` : ' -'}
												</p>
											{/each}
										</div>
									{:else}
										<p>-</p>
									{/if}
								</div>
								<div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
									{#if match.left}
										<div class="bg-blue-50 p-2 rounded">
											<p class="font-medium text-blue-700 mb-1">{leftLabel}</p>
											<p>ID: {match.left.idReferentiel || '-'}</p>
											{#if match.left.cib}
												<p>CIB: {match.left.cib}</p>
											{/if}
											<p>LEI: {match.left.lei || '-'}</p>
											<p>Ville: {match.left.ville || '-'}</p>
											<p>Categorie: {match.left.categorie || '-'}</p>
											<p>Roles PSD2: {formatEntityRolesByCountry(match.left.rolesByCountry)}</p>
										</div>
									{/if}
									{#if match.right}
										<div class="bg-purple-50 p-2 rounded">
											<p class="font-medium text-purple-700 mb-1">{rightLabel}</p>
											<p>Code: {match.right.entityCode || '-'}</p>
											{#if match.right.cib}
												<p>CIB: {match.right.cib}</p>
											{/if}
											<p>Ville: {match.right.ville || '-'}</p>
											<p>Categorie: {match.right.categorie || '-'}</p>
											<p>Roles PSD2: {formatEntityRolesByCountry(match.right.rolesByCountry)}</p>
										</div>
									{/if}
								</div>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	</div>

	{#if filtered.length === 0}
		<div class="text-center py-8 text-gray-500 text-sm">
			No results match the filters.
		</div>
	{/if}
</div>
