<script lang="ts">
	import type { ComparisonMatch } from '$lib/types';

	let { matches } = $props<{ matches: ComparisonMatch[] }>();

	let search = $state('');
	let statusFilter = $state<string>('all');
	let expanded = $state<Set<string>>(new Set());

	const filtered = $derived(
		matches.filter((m: ComparisonMatch) => {
			if (statusFilter !== 'all' && m.status !== statusFilter) return false;
			if (search) {
				const q = search.toLowerCase();
				const re = m.regafi?.denomination.toLowerCase() || '';
				const eb = m.eba?.denomination.toLowerCase() || '';
				if (!re.includes(q) && !eb.includes(q) && !m.siren.includes(q)) return false;
			}
			return true;
		})
	);

	const statusLabels: Record<string, string> = {
		match: '✅ Correspondance',
		nameMismatch: '⚠️ Nom différent',
		cityMismatch: '⚠️ Ville différente',
		categoryMismatch: '⚠️ Catégorie différente',
		onlyInRegafi: '❌ Uniquement REGAFI',
		onlyInEba: '❓ Uniquement EBA'
	};

	const statusColors: Record<string, string> = {
		match: 'bg-green-100 text-green-800',
		nameMismatch: 'bg-amber-100 text-amber-800',
		cityMismatch: 'bg-amber-100 text-amber-800',
		categoryMismatch: 'bg-amber-100 text-amber-800',
		onlyInRegafi: 'bg-red-100 text-red-800',
		onlyInEba: 'bg-purple-100 text-purple-800'
	};

	function escapeCsv(value: string | null | undefined): string {
		const normalized = value ?? '';
		const escaped = normalized.replace(/"/g, '""');
		return `"${escaped}"`;
	}

	function exportFilteredToCsv() {
		const header = ['Statut', 'SIREN', 'Denomination', 'Categorie', 'Ville', 'Differences'];
		const rows = filtered.map((match: ComparisonMatch) => {
			const denomination = match.regafi?.denomination || match.eba?.denomination || '';
			const categorie = match.regafi?.categorie || match.eba?.categorie || '';
			const ville = match.regafi?.ville || match.eba?.ville || '';
			const differences = match.differences.join(' | ');

			return [
				escapeCsv(statusLabels[match.status] || match.status),
				escapeCsv(match.siren),
				escapeCsv(denomination),
				escapeCsv(categorie),
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
</script>

<div class="space-y-4">
	<div class="flex flex-col lg:flex-row gap-3 lg:items-center">
		<input
			type="text"
			placeholder="Rechercher par nom ou SIREN..."
			class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
			bind:value={search}
		/>

		<div class="flex flex-col sm:flex-row gap-3">
			<select
				class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
				bind:value={statusFilter}
			>
				<option value="all">Tous les statuts</option>
				<option value="match">✅ Correspondances</option>
				<option value="nameMismatch">⚠️ Noms différents</option>
				<option value="cityMismatch">⚠️ Villes différentes</option>
				<option value="categoryMismatch">⚠️ Catégories différentes</option>
				<option value="onlyInRegafi">❌ Uniquement REGAFI</option>
				<option value="onlyInEba">❓ Uniquement EBA</option>
			</select>

			<button
				type="button"
				class="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
				onclick={exportFilteredToCsv}
				disabled={filtered.length === 0}
			>
				Exporter ({filtered.length})
			</button>
		</div>
	</div>

	<div class="text-sm text-gray-500">
		{filtered.length} / {matches.length} résultats
	</div>

	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-200 text-sm">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Statut</th>
					<th class="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">SIREN</th>
					<th class="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Dénomination</th>
					<th class="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Catégorie</th>
					<th class="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Ville</th>
					<th class="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Détails</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#each filtered as match}
					<tr class="hover:bg-gray-50 cursor-pointer" onclick={() => toggleExpand(match.siren)}>
						<td class="px-4 py-3 whitespace-nowrap">
							<span class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full {statusColors[match.status]}">
								{statusLabels[match.status]}
							</span>
						</td>
						<td class="px-4 py-3 whitespace-nowrap font-mono text-xs">{match.siren}</td>
						<td class="px-4 py-3">
							<div class="text-gray-900">{match.regafi?.denomination || match.eba?.denomination || '-'}</div>
						</td>
						<td class="px-4 py-3 whitespace-nowrap">{match.regafi?.categorie || match.eba?.categorie || '-'}</td>
						<td class="px-4 py-3 whitespace-nowrap">{match.regafi?.ville || match.eba?.ville || '-'}</td>
						<td class="px-4 py-3">
							<button class="text-blue-600 hover:text-blue-800 text-xs font-medium">
								{expanded.has(match.siren) ? 'Masquer' : 'Voir'}
							</button>
						</td>
					</tr>
					{#if expanded.has(match.siren)}
						<tr class="bg-gray-50">
							<td colspan="6" class="px-4 py-3">
								{#if match.differences.length > 0}
									<div class="space-y-1">
										<p class="text-xs font-medium text-gray-500 mb-1">Différences :</p>
										{#each match.differences as diff}
											<p class="text-sm text-amber-700 bg-amber-50 px-2 py-1 rounded">{diff}</p>
										{/each}
									</div>
								{/if}
								<div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
									{#if match.regafi}
										<div class="bg-blue-50 p-2 rounded">
											<p class="font-medium text-blue-700 mb-1">REGAFI</p>
											<p>ID: {match.regafi.idReferentiel || '-'}</p>
											<p>LEI: {match.regafi.lei || '-'}</p>
											<p>Ville: {match.regafi.ville || '-'}</p>
											<p>Catégorie: {match.regafi.categorie || '-'}</p>
										</div>
									{/if}
									{#if match.eba}
										<div class="bg-purple-50 p-2 rounded">
											<p class="font-medium text-purple-700 mb-1">EBA</p>
											<p>Code: {match.eba.entityCode || '-'}</p>
											<p>Ville: {match.eba.ville || '-'}</p>
											<p>Catégorie: {match.eba.categorie || '-'}</p>
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
			Aucun résultat ne correspond aux filtres.
		</div>
	{/if}
</div>
