<script lang="ts">
	import { onMount } from 'svelte';
	import EbaUpload from '$lib/components/EbaUpload.svelte';
	import RegafiUpload from '$lib/components/RegafiUpload.svelte';
	import type { NormalizedEntity } from '$lib/types';

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

	let ebaSortKey = $state<'siren' | 'denomination' | 'none'>('siren');
	let regafiSortKey = $state<'siren' | 'denomination' | 'none'>('siren');

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

	async function onEbaLoaded(payload: { datasetId: string; count: number; sortKey: 'siren' }) {
		ebaDatasetId = payload.datasetId;
		ebaCount = payload.count;
		ebaSortKey = payload.sortKey;
		error = null;
		ebaPage = 1;
		await loadEbaPage();
	}

	async function onRegafiLoaded(payload: { datasetId: string; count: number; sortKey: 'siren' }) {
		regafiDatasetId = payload.datasetId;
		regafiCount = payload.count;
		regafiSortKey = payload.sortKey;
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

	onMount(() => {
		if (!ebaDatasetId) void loadLatestEba();
		if (!regafiDatasetId) void loadLatestRegafi();
	});

	async function loadLatestEba() {
		ebaLoading = true;
		try {
			const params = new URLSearchParams({
				latest: '1',
				page: String(ebaPage),
				pageSize: String(PAGE_SIZE),
				search: ebaSearch,
				sortKey: ebaSortKey
			});
			const res = await fetch(`/api/eba?${params}`);
			const data = await res.json();
			if (!data.success || !data.datasetId) return;
			ebaDatasetId = data.datasetId;
			ebaPageItems = data.items;
			ebaCount = data.total;
			ebaPage = data.page;
		} finally {
			ebaLoading = false;
		}
	}

	async function loadLatestRegafi() {
		regafiLoading = true;
		try {
			const params = new URLSearchParams({
				latest: '1',
				page: String(regafiPage),
				pageSize: String(PAGE_SIZE),
				search: regafiSearch,
				sortKey: regafiSortKey
			});
			const res = await fetch(`/api/regafi?${params}`);
			const data = await res.json();
			if (!data.success || !data.datasetId) return;
			regafiDatasetId = data.datasetId;
			regafiPageItems = data.items;
			regafiCount = data.total;
			regafiPage = data.page;
		} finally {
			regafiLoading = false;
		}
	}
</script>

<div class="space-y-8">
	<!-- <div class="text-center">
		<h1 class="text-4xl font-bold text-gray-900">Registres EBA ↔ REGAFI</h1>
		<p class="mt-3 text-base text-gray-500 max-w-2xl mx-auto">
			Consultez les entités françaises du registre PSD2 de l'<strong>EBA</strong>
			(European Banking Authority) et celles du <strong>REGAFI</strong>
			(ACPR).
		</p>
	</div> -->

	<div class="grid grid-cols-1 gap-6">
		<section class="bg-white rounded-lg border border-gray-200 p-6">
			<div class="border border-gray-200 rounded-lg overflow-hidden">
				<div class="bg-blue-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-4">
					<h3 class="text-base font-semibold text-blue-800">EBA ({ebaCount})</h3>
					<EbaUpload onLoaded={onEbaLoaded} />
				</div>

				{#if ebaDatasetId}
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
						<table class="w-full text-sm">
							<thead class="bg-gray-50 sticky top-0">
								<tr>
									<th class="px-4 py-3 text-left font-medium text-gray-500">SIREN</th>
									<th class="px-4 py-3 text-left font-medium text-gray-500">Dénomination</th>
									<th class="px-4 py-3 text-left font-medium text-gray-500">Ville</th>
									<th class="px-4 py-3 text-left font-medium text-gray-500">Pays</th>
									<th class="px-4 py-3 text-left font-medium text-gray-500">Catégorie</th>
									<th class="px-4 py-3 text-left font-medium text-gray-500">Code EBA</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each ebaPageItems as entity}
									<tr class="hover:bg-gray-50">
										<td class="px-4 py-3 font-mono">{entity.siren || '-'}</td>
										<td class="px-4 py-3 truncate max-w-56">{entity.denomination}</td>
										<td class="px-4 py-3">{entity.ville || '-'}</td>
										<td class="px-4 py-3">{entity.pays || '-'}</td>
										<td class="px-4 py-3 truncate max-w-40">{entity.categorie || '-'}</td>
										<td class="px-4 py-3 font-mono text-xs">{entity.entityCode || '-'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
						<button class="disabled:opacity-30" disabled={ebaPage <= 1} onclick={() => { ebaPage = Math.max(1, ebaPage - 1); void loadEbaPage(); }}>
							← Préc.
						</button>
						<span>Page {ebaPage} / {ebaTotalPages}</span>
						<button class="disabled:opacity-30" disabled={ebaPage >= ebaTotalPages} onclick={() => { ebaPage = Math.min(ebaTotalPages, ebaPage + 1); void loadEbaPage(); }}>
							Suiv. →
						</button>
					</div>
				{/if}
			</div>
		</section>

		<section class="bg-white rounded-lg border border-gray-200 p-6">
			<div class="border border-gray-200 rounded-lg overflow-hidden">
				<div class="bg-red-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-4">
					<h3 class="text-base font-semibold text-red-800">REGAFI ({regafiCount})</h3>
					<RegafiUpload onLoaded={onRegafiLoaded} />
				</div>

				{#if regafiDatasetId}
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
						<table class="w-full text-sm">
							<thead class="bg-gray-50 sticky top-0">
								<tr>
									<th class="px-4 py-3 text-left font-medium text-gray-500">SIREN</th>
									<th class="px-4 py-3 text-left font-medium text-gray-500">Dénomination</th>
									<th class="px-4 py-3 text-left font-medium text-gray-500">Ville</th>
									<th class="px-4 py-3 text-left font-medium text-gray-500">Pays</th>
									<th class="px-4 py-3 text-left font-medium text-gray-500">Catégorie</th>
									<th class="px-4 py-3 text-left font-medium text-gray-500">LEI</th>
									<th class="px-4 py-3 text-left font-medium text-gray-500">ID référentiel</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each regafiPageItems as entity}
									<tr class="hover:bg-gray-50">
										<td class="px-4 py-3 font-mono">{entity.siren || '-'}</td>
										<td class="px-4 py-3 truncate max-w-56">{entity.denomination}</td>
										<td class="px-4 py-3">{entity.ville || '-'}</td>
										<td class="px-4 py-3">{entity.pays || '-'}</td>
										<td class="px-4 py-3 truncate max-w-40">{entity.categorie || '-'}</td>
										<td class="px-4 py-3 font-mono text-xs">{entity.lei || '-'}</td>
										<td class="px-4 py-3 font-mono text-xs">{entity.idReferentiel || '-'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
						<button class="disabled:opacity-30" disabled={regafiPage <= 1} onclick={() => { regafiPage = Math.max(1, regafiPage - 1); void loadRegafiPage(); }}>
							← Préc.
						</button>
						<span>Page {regafiPage} / {regafiTotalPages}</span>
						<button class="disabled:opacity-30" disabled={regafiPage >= regafiTotalPages} onclick={() => { regafiPage = Math.min(regafiTotalPages, regafiPage + 1); void loadRegafiPage(); }}>
							Suiv. →
						</button>
					</div>
				{/if}
			</div>
		</section>
	</div>

	{#if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4">
			<p class="text-sm text-red-700">{error}</p>
		</div>
	{/if}
</div>