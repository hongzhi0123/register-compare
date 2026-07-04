<script lang="ts">
	import { browser } from '$app/environment';
	import SummaryCards from '$lib/components/SummaryCards.svelte';
	import ResultsTable from '$lib/components/ResultsTable.svelte';
	import type { ComparisonResult } from '$lib/types';

	let result = $state<ComparisonResult | null>(null);
	let error = $state<string | null>(null);

	if (browser) {
		const stored = sessionStorage.getItem('compareResult');
		if (stored) {
			try {
				result = JSON.parse(stored);
			} catch {
				error = 'Erreur de lecture des résultats';
			}
		} else {
			error = 'Aucun résultat trouvé. Veuillez d\'abord lancer une comparaison.';
		}
	}
</script>

{#if error}
	<div class="text-center py-12">
		<p class="text-red-600">{error}</p>
		<a href="/" class="mt-4 inline-block text-blue-600 underline">Retour à l'accueil</a>
	</div>
{:else if result}
	<div class="space-y-6">
		<div class="flex items-center justify-between">
			<h1 class="text-2xl font-bold text-gray-900">Résultats de la comparaison</h1>
			<a href="/" class="text-sm text-blue-600 hover:underline">← Nouvelle comparaison</a>
		</div>

		<SummaryCards result={result} />

		<div class="bg-white rounded-lg border border-gray-200 p-6">
			<h2 class="text-lg font-semibold text-gray-900 mb-4">Détail des correspondances</h2>
			<ResultsTable matches={result.matches} />
		</div>
	</div>
{:else}
	<div class="text-center py-12">
		<p class="text-gray-500">Chargement...</p>
	</div>
{/if}
