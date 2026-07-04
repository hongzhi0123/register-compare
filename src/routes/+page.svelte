<script lang="ts">
	import EbaUpload from '$lib/components/EbaUpload.svelte';
	import RegafiUpload from '$lib/components/RegafiUpload.svelte';
	import type { NormalizedEntity } from '$lib/types';

	let step = $state<1 | 2 | 3>(1);
	let error = $state<string | null>(null);

	let ebaDatasetId = $state<string | null>(null);
	let regafiDatasetId = $state<string | null>(null);
	let ebaCount = $state(0);
	let regafiCount = $state(0);
	let ebaPageItems = $state<NormalizedEntity[]>([]);
	let regafiPageItems = $state<NormalizedEntity[]>([]);
	let ebaLoading = $state(false);
	let regafiLoading = $state(false);

	const PAGE_SIZE = 10;
	let ebaPage = $state(1);
	let regafiPage = $state(1);
	let ebaSearch = $state('');
	let regafiSearch = $state('');

	let ebaSortKey = $state<'siren' | 'denomination'>('siren');
	let regafiSortKey = $state<'siren' | 'denomination'>('siren');

	async function loadEbaPage() {
		if (!ebaDatasetId) return;
		ebaLoading = true;
		try {
			const params = new URLSearchParams({
				datasetId: ebaDatasetId,
				page: String(ebaPage),
				pageSize: String(PAGE_SIZE),
				search: ebaSearch,
				sortKey: ebaSortKey
			});
			const res = await fetch(`/api/eba?${params}`);
			const data = await res.json();
			if (!data.success) throw new Error(data.error || 'Erreur lors du chargement EBA');
			ebaPageItems = data.items;
			ebaCount = data.total;
			ebaPage = data.page;
		} finally {
			ebaLoading = false;
		}
	}

	async function loadRegafiPage() {
		if (!regafiDatasetId) return;
		regafiLoading = true;
		try {
			const params = new URLSearchParams({
				datasetId: regafiDatasetId,
				page: String(regafiPage),
				pageSize: String(PAGE_SIZE),
				search: regafiSearch,
				sortKey: regafiSortKey
			});
			const res = await fetch(`/api/regafi?${params}`);
			const data = await res.json();
			if (!data.success) throw new Error(data.error || 'Erreur lors du chargement REGAFI');
			regafiPageItems = data.items;
			regafiCount = data.total;
			regafiPage = data.page;
		} finally {
			regafiLoading = false;
		}
	}

	async function onEbaLoaded(payload: { datasetId: string; count: number }) {
		ebaDatasetId = payload.datasetId;
		ebaCount = payload.count;
		step = 2;
		error = null;
		ebaPage = 1;
		await loadEbaPage();
	}

	async function onRegafiLoaded(payload: { datasetId: string; count: number }) {
		regafiDatasetId = payload.datasetId;
		regafiCount = payload.count;
		step = 3;
		error = null;
		regafiPage = 1;
		await loadRegafiPage();
	}

	function resetAll() {
		ebaDatasetId = null;
		regafiDatasetId = null;
		ebaCount = 0;
		regafiCount = 0;
		ebaPageItems = [];
		regafiPageItems = [];
		step = 1;
		error = null;
		ebaPage = 1;
		regafiPage = 1;
		ebaSearch = '';
		regafiSearch = '';
		ebaSortKey = 'siren';
		regafiSortKey = 'siren';
	}

	const ebaTotalPages = $derived(Math.max(1, Math.ceil(ebaCount / PAGE_SIZE)));
	const regafiTotalPages = $derived(Math.max(1, Math.ceil(regafiCount / PAGE_SIZE)));
</script>

<div class="space-y-8">
	<div class="text-center">
		<h1 class="text-3xl font-bold text-gray-900">Registres EBA ↔ REGAFI</h1>
		<p class="mt-2 text-sm text-gray-500 max-w-xl mx-auto">
			Consultez côte à côte les entités françaises du registre PSD2 de l'<strong>EBA</strong>
			(European Banking Authority) et celles du <strong>REGAFI</strong>
			(ACPR).
		</p>
	</div>

	<!-- Step indicator -->
	<div class="flex items-center justify-center gap-2 text-sm">
		<div class="flex items-center gap-1">
			<span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
				{step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}">1</span>
			<span class="{step >= 1 ? 'text-gray-700' : 'text-gray-400'}">Fichier EBA</span>
		</div>
		<div class="w-8 h-px bg-gray-300"></div>
		<div class="flex items-center gap-1">
			<span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
				{step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}">2</span>
			<span class="{step >= 2 ? 'text-gray-700' : 'text-gray-400'}">Fichier REGAFI</span>
		</div>
		<div class="w-8 h-px bg-gray-300"></div>
		<div class="flex items-center gap-1">
			<span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
				{step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}">3</span>
			<span class="{step >= 3 ? 'text-gray-700' : 'text-gray-400'}">Visualisation</span>
		</div>
	</div>

	<!-- Step 1: Upload EBA -->
	<div class="bg-white rounded-lg border border-gray-200 p-6">
		<h2 class="text-lg font-semibold text-gray-900 mb-4">
			1. Téléchargez le fichier JSON EBA
		</h2>
		<p class="text-sm text-gray-500 mb-4">
			Téléchargez d'abord le fichier depuis
			<a href="https://euclid.eba.europa.eu/register/pir/registerDownload" target="_blank" class="text-blue-600 underline">
				euclid.eba.europa.eu/register/pir/registerDownload
			</a>
			(acceptez le disclaimer, le fichier JSON se télécharge automatiquement).
		</p>
		<EbaUpload onLoaded={onEbaLoaded} />
	</div>

	<!-- Step 2: Upload REGAFI -->
	<div class="bg-white rounded-lg border border-gray-200 p-6" class:opacity-40={step < 2}>
		<h2 class="text-lg font-semibold text-gray-900 mb-4">
			2. Téléchargez le fichier JSON REGAFI
		</h2>
		<p class="text-sm text-gray-500 mb-4">
			Téléchargez d'abord le fichier depuis l'API REGAFI (catalogue-banque)
			via <a href="https://developer.regafi.banque-france.fr" target="_blank" class="text-red-600 underline">developer.regafi.banque-france.fr</a>.
		</p>
		<RegafiUpload onLoaded={onRegafiLoaded} />
	</div>

	<!-- Step 3: Visualisation -->
	{#if step === 3}
		<div class="bg-white rounded-lg border border-gray-200 p-6">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-semibold text-gray-900">
					3. Visualisation des données
				</h2>
				<button
					class="text-sm text-blue-600 hover:underline"
					onclick={resetAll}
				>
					← Nouveaux fichiers
				</button>
			</div>
			<p class="text-sm text-gray-500 mb-6">
				{ebaCount.toLocaleString()} entités EBA · {regafiCount.toLocaleString()} entités REGAFI
			</p>

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<!-- EBA Table -->
				<div class="border border-gray-200 rounded-lg overflow-hidden">
					<div class="bg-blue-50 px-4 py-3 border-b border-gray-200">
						<h3 class="font-semibold text-blue-800">EBA ({ebaCount})</h3>
					</div>
					<div class="p-3 border-b border-gray-200">
						<input
							type="text"
							placeholder="Filtrer par SIREN ou nom..."
							class="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							bind:value={ebaSearch}
							onchange={() => { ebaPage = 1; void loadEbaPage(); }}
							oninput={() => { ebaPage = 1; void loadEbaPage(); }}
						/>
					</div>
					<div class="overflow-x-auto max-h-96 overflow-y-auto">
						<table class="w-full text-xs">
							<thead class="bg-gray-50 sticky top-0">
								<tr>
									<th
										class="px-3 py-2 text-left font-medium text-gray-500 cursor-pointer hover:text-gray-700"
										onclick={() => { ebaSortKey = 'siren'; ebaPage = 1; void loadEbaPage(); }}
									>
										SIREN {ebaSortKey === 'siren' ? '↓' : ''}
									</th>
									<th
										class="px-3 py-2 text-left font-medium text-gray-500 cursor-pointer hover:text-gray-700"
										onclick={() => { ebaSortKey = 'denomination'; ebaPage = 1; void loadEbaPage(); }}
									>
										Dénomination {ebaSortKey === 'denomination' ? '↓' : ''}
									</th>
									<th class="px-3 py-2 text-left font-medium text-gray-500">Ville</th>
									<th class="px-3 py-2 text-left font-medium text-gray-500">Catégorie</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
									{#each ebaPageItems as entity}
									<tr class="hover:bg-gray-50">
										<td class="px-3 py-2 font-mono">{entity.siren}</td>
										<td class="px-3 py-2 truncate max-w-48">{entity.denomination}</td>
										<td class="px-3 py-2">{entity.ville || '-'}</td>
										<td class="px-3 py-2 truncate max-w-36">{entity.categorie || '-'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<div class="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
						<button
							class="disabled:opacity-30"
							disabled={ebaPage <= 1}
							onclick={() => { ebaPage = Math.max(1, ebaPage - 1); void loadEbaPage(); }}
						>
							← Préc.
						</button>
						<span>Page {ebaPage} / {ebaTotalPages}</span>
						<button
							class="disabled:opacity-30"
							disabled={ebaPage >= ebaTotalPages}
							onclick={() => { ebaPage = Math.min(ebaTotalPages, ebaPage + 1); void loadEbaPage(); }}
						>
							Suiv. →
						</button>
					</div>
				</div>

				<!-- REGAFI Table -->
				<div class="border border-gray-200 rounded-lg overflow-hidden">
					<div class="bg-red-50 px-4 py-3 border-b border-gray-200">
						<h3 class="font-semibold text-red-800">REGAFI ({regafiCount})</h3>
					</div>
					<div class="p-3 border-b border-gray-200">
						<input
							type="text"
							placeholder="Filtrer par SIREN ou nom..."
							class="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
							bind:value={regafiSearch}
							onchange={() => { regafiPage = 1; void loadRegafiPage(); }}
							oninput={() => { regafiPage = 1; void loadRegafiPage(); }}
						/>
					</div>
					<div class="overflow-x-auto max-h-96 overflow-y-auto">
						<table class="w-full text-xs">
							<thead class="bg-gray-50 sticky top-0">
								<tr>
									<th
										class="px-3 py-2 text-left font-medium text-gray-500 cursor-pointer hover:text-gray-700"
										onclick={() => { regafiSortKey = 'siren'; regafiPage = 1; void loadRegafiPage(); }}
									>
										SIREN {regafiSortKey === 'siren' ? '↓' : ''}
									</th>
									<th
										class="px-3 py-2 text-left font-medium text-gray-500 cursor-pointer hover:text-gray-700"
										onclick={() => { regafiSortKey = 'denomination'; regafiPage = 1; void loadRegafiPage(); }}
									>
										Dénomination {regafiSortKey === 'denomination' ? '↓' : ''}
									</th>
									<th class="px-3 py-2 text-left font-medium text-gray-500">Ville</th>
									<th class="px-3 py-2 text-left font-medium text-gray-500">Catégorie</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each regafiPageItems as entity}
									<tr class="hover:bg-gray-50">
										<td class="px-3 py-2 font-mono">{entity.siren}</td>
										<td class="px-3 py-2 truncate max-w-48">{entity.denomination}</td>
										<td class="px-3 py-2">{entity.ville || '-'}</td>
										<td class="px-3 py-2 truncate max-w-36">{entity.categorie || '-'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<div class="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
						<button
							class="disabled:opacity-30"
							disabled={regafiPage <= 1}
								onclick={() => { regafiPage = Math.max(1, regafiPage - 1); void loadRegafiPage(); }}
						>
							← Préc.
						</button>
						<span>Page {regafiPage} / {regafiTotalPages}</span>
						<button
							class="disabled:opacity-30"
							disabled={regafiPage >= regafiTotalPages}
								onclick={() => { regafiPage = Math.min(regafiTotalPages, regafiPage + 1); void loadRegafiPage(); }}
						>
							Suiv. →
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	{#if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4">
			<p class="text-sm text-red-700">{error}</p>
		</div>
	{/if}
</div>