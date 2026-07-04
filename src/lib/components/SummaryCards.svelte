<script lang="ts">
	import type { ComparisonResult } from '$lib/types';

	let { result } = $props<{ result: ComparisonResult }>();

	const s = $derived(result.summary);
</script>

<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
	<div class="bg-white rounded-lg border border-gray-200 p-4">
		<p class="text-xs font-medium text-gray-500 uppercase tracking-wider">Total REGAFI</p>
		<p class="mt-1 text-2xl font-bold text-gray-900">{s.totalRegafi.toLocaleString()}</p>
		<p class="text-xs text-gray-400 mt-1">Entités françaises</p>
	</div>

	<div class="bg-white rounded-lg border border-gray-200 p-4">
		<p class="text-xs font-medium text-gray-500 uppercase tracking-wider">Total EBA</p>
		<p class="mt-1 text-2xl font-bold text-gray-900">{s.totalEba.toLocaleString()}</p>
		<p class="text-xs text-gray-400 mt-1">Entités ACPR (FR)</p>
	</div>

	<div class="bg-white rounded-lg border border-green-200 p-4 bg-green-50">
		<p class="text-xs font-medium text-green-700 uppercase tracking-wider">✅ Correspondances</p>
		<p class="mt-1 text-2xl font-bold text-green-700">{s.totalMatches.toLocaleString()}</p>
		<p class="text-xs text-green-600 mt-1">SIREN + infos identiques</p>
	</div>

	<div class="bg-white rounded-lg border border-amber-200 p-4 bg-amber-50">
		<p class="text-xs font-medium text-amber-700 uppercase tracking-wider">⚠️ Différences</p>
		<p class="mt-1 text-2xl font-bold text-amber-700">
			{(s.totalNameMismatches + s.totalCityMismatches + s.totalCategoryMismatches).toLocaleString()}
		</p>
		<p class="text-xs text-amber-600 mt-1">SIREN commun, champs différents</p>
	</div>

	<div class="bg-white rounded-lg border border-red-200 p-4 bg-red-50">
		<p class="text-xs font-medium text-red-700 uppercase tracking-wider">❌ Uniquement REGAFI</p>
		<p class="mt-1 text-2xl font-bold text-red-700">{s.totalOnlyInRegafi.toLocaleString()}</p>
		<p class="text-xs text-red-600 mt-1">Absents de l'EBA</p>
	</div>

	<div class="bg-white rounded-lg border border-purple-200 p-4 bg-purple-50">
		<p class="text-xs font-medium text-purple-700 uppercase tracking-wider">❓ Uniquement EBA</p>
		<p class="mt-1 text-2xl font-bold text-purple-700">{s.totalOnlyInEba.toLocaleString()}</p>
		<p class="text-xs text-purple-600 mt-1">Absents du REGAFI</p>
	</div>
</div>
