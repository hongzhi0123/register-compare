<script lang="ts">
	import { onMount } from 'svelte';
	import EbaUpload from '$lib/components/EbaUpload.svelte';
	import RegafiUpload from '$lib/components/RegafiUpload.svelte';
	import type { NormalizedEntity } from '$lib/types';

	type DatasetColumnKey =
		| 'siren'
		| 'denomination'
		| 'ville'
		| 'pays'
		| 'categorie'
		| 'entityCode'
		| 'lei'
		| 'idReferentiel';
	type SortKey = DatasetColumnKey | 'none';
	type SortDirection = 'asc' | 'desc';
	type FilterType = 'none' | 'text' | 'select' | 'text-select';
	type SelectFilterValue = string[];

	interface SelectOption {
		value: string;
		label: string;
	}

	const SPECIAL_SELECT_OPTIONS: SelectOption[] = [
		{ value: '__all__', label: 'Toutes' },
		{ value: '__empty__', label: 'Valeur vide uniquement' },
		{ value: '__non_empty__', label: 'Exclure les valeurs vides' }
	];

	interface TableColumn {
		key: DatasetColumnKey;
		label: string;
		sortable: boolean;
		filterType: FilterType;
		widthClass?: string;
		cellClass?: string;
	}

	const EBA_COLUMNS: TableColumn[] = [
		{ key: 'siren', label: 'SIREN', sortable: true, filterType: 'none', widthClass: 'w-28', cellClass: 'font-mono' },
		{
			key: 'denomination',
			label: 'Dénomination',
			sortable: true,
			filterType: 'text',
			widthClass: 'w-36',
			cellClass: 'truncate max-w-56'
		},
		{ key: 'ville', label: 'Ville', sortable: true, filterType: 'text-select', widthClass: 'w-36' },
		{ key: 'pays', label: 'Pays', sortable: true, filterType: 'select', widthClass: 'w-28' },
		{
			key: 'categorie',
			label: 'Catégorie',
			sortable: true,
			filterType: 'select',
			widthClass: 'w-44',
			cellClass: 'truncate max-w-40'
		},
		{ key: 'entityCode', label: 'Code EBA', sortable: true, filterType: 'text-select', widthClass: 'w-36', cellClass: 'font-mono text-xs' }
	];

	const REGAFI_COLUMNS: TableColumn[] = [
		{ key: 'siren', label: 'SIREN', sortable: true, filterType: 'none', widthClass: 'w-28', cellClass: 'font-mono' },
		{
			key: 'denomination',
			label: 'Dénomination',
			sortable: true,
			filterType: 'text',
			widthClass: 'w-36',
			cellClass: 'truncate max-w-56'
		},
		{ key: 'ville', label: 'Ville', sortable: true, filterType: 'text-select', widthClass: 'w-36' },
		{ key: 'pays', label: 'Pays', sortable: true, filterType: 'select', widthClass: 'w-28' },
		{
			key: 'categorie',
			label: 'Catégorie',
			sortable: true,
			filterType: 'select',
			widthClass: 'w-44',
			cellClass: 'truncate max-w-40'
		},
		{ key: 'lei', label: 'LEI', sortable: true, filterType: 'text-select', widthClass: 'w-44', cellClass: 'font-mono text-xs' },
		{
			key: 'idReferentiel',
			label: 'ID référentiel',
			sortable: true,
			filterType: 'text-select',
			widthClass: 'w-44',
			cellClass: 'font-mono text-xs'
		}
	];

	function createTextFilters(columns: TableColumn[]): Partial<Record<DatasetColumnKey, string>> {
		const entries = columns
			.filter((column) => column.filterType === 'text' || column.filterType === 'text-select')
			.map((column) => [column.key, ''] as const);
		return Object.fromEntries(entries) as Partial<Record<DatasetColumnKey, string>>;
	}

	function createSelectFilters(columns: TableColumn[]): Partial<Record<DatasetColumnKey, SelectFilterValue>> {
		const entries = columns
			.filter((column) => column.filterType === 'select' || column.filterType === 'text-select')
			.map((column) => [column.key, [] as string[]] as const);
		return Object.fromEntries(entries) as Partial<Record<DatasetColumnKey, SelectFilterValue>>;
	}

	function toFilterParams(filters: Partial<Record<DatasetColumnKey, string | string[]>>): string {
		const cleaned = Object.fromEntries(
			Object.entries(filters).map(([key, value]) => {
				if (Array.isArray(value)) {
					return [key, value.filter((item) => typeof item === 'string')];
				}
				return [key, value ?? ''];
			})
		) as Partial<Record<DatasetColumnKey, string | string[]>>;
		return JSON.stringify(cleaned);
	}

	function getSelectOptions(
		column: TableColumn,
		filterOptions: Partial<Record<DatasetColumnKey, string[]>>
	): SelectOption[] {
		if (column.filterType !== 'select') {
			return SPECIAL_SELECT_OPTIONS;
		}

		const dynamic = (filterOptions[column.key] ?? []).map((value) => ({ value, label: value }));
		return [...SPECIAL_SELECT_OPTIONS, ...dynamic];
	}

	function getSelectFilterLabel(
		filters: Partial<Record<DatasetColumnKey, SelectFilterValue>>,
		key: DatasetColumnKey
	): string {
		const selected = filters[key] ?? [];
		if (selected.length === 0) return 'Toutes';
		if (selected.length === 1) {
			const special = SPECIAL_SELECT_OPTIONS.find((option) => option.value === selected[0]);
			return special?.label ?? selected[0];
		}
		return `${selected.length} selections`;
	}

	function isSelectValueChecked(
		filters: Partial<Record<DatasetColumnKey, SelectFilterValue>>,
		key: DatasetColumnKey,
		value: string
	): boolean {
		const selected = filters[key] ?? [];
		if (value === '__all__') return selected.length === 0;
		return selected.includes(value);
	}

	function toggleSelectValue(current: string[], value: string): string[] {
		if (value === '__all__') return [];

		const selected = new Set(current);
		if (selected.has(value)) {
			selected.delete(value);
		} else {
			selected.add(value);
		}

		return Array.from(selected);
	}

	function isSortActive(sortKey: SortKey, sortDir: SortDirection, key: DatasetColumnKey, dir: SortDirection): boolean {
		return sortKey === key && sortDir === dir;
	}

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

	let ebaSortKey = $state<SortKey>('siren');
	let regafiSortKey = $state<SortKey>('siren');
	let ebaSortDir = $state<SortDirection>('asc');
	let regafiSortDir = $state<SortDirection>('asc');

	let ebaTextFilters = $state<Partial<Record<DatasetColumnKey, string>>>(createTextFilters(EBA_COLUMNS));
	let regafiTextFilters = $state<Partial<Record<DatasetColumnKey, string>>>(createTextFilters(REGAFI_COLUMNS));
	let ebaSelectFilters = $state<Partial<Record<DatasetColumnKey, SelectFilterValue>>>(createSelectFilters(EBA_COLUMNS));
	let regafiSelectFilters = $state<Partial<Record<DatasetColumnKey, SelectFilterValue>>>(createSelectFilters(REGAFI_COLUMNS));
	let ebaFilterOptions = $state<Partial<Record<DatasetColumnKey, string[]>>>({});
	let regafiFilterOptions = $state<Partial<Record<DatasetColumnKey, string[]>>>({});

	async function loadEbaPage() {
		if (!ebaDatasetId) return;
		ebaLoading = true;
		try {
			const params = new URLSearchParams({
				datasetId: ebaDatasetId,
				page: String(ebaPage),
				pageSize: String(PAGE_SIZE),
				sortKey: ebaSortKey,
				sortDir: ebaSortDir,
				textFilters: toFilterParams(ebaTextFilters),
				selectFilters: toFilterParams(ebaSelectFilters)
			});
			const res = await fetch(`/api/eba?${params}`);
			const data = await res.json();
			if (!data.success) throw new Error(data.error || 'Erreur lors du chargement EBA');
			ebaPageItems = data.items;
			ebaCount = data.total;
			ebaPage = data.page;
			ebaFilterOptions = data.filterOptions || {};
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
				sortKey: regafiSortKey,
				sortDir: regafiSortDir,
				textFilters: toFilterParams(regafiTextFilters),
				selectFilters: toFilterParams(regafiSelectFilters)
			});
			const res = await fetch(`/api/regafi?${params}`);
			const data = await res.json();
			if (!data.success) throw new Error(data.error || 'Erreur lors du chargement REGAFI');
			regafiPageItems = data.items;
			regafiCount = data.total;
			regafiPage = data.page;
			regafiFilterOptions = data.filterOptions || {};
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
		ebaSortKey = 'siren';
		regafiSortKey = 'siren';
		ebaSortDir = 'asc';
		regafiSortDir = 'asc';
		ebaTextFilters = createTextFilters(EBA_COLUMNS);
		regafiTextFilters = createTextFilters(REGAFI_COLUMNS);
		ebaSelectFilters = createSelectFilters(EBA_COLUMNS);
		regafiSelectFilters = createSelectFilters(REGAFI_COLUMNS);
		ebaFilterOptions = {};
		regafiFilterOptions = {};
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
				sortKey: ebaSortKey,
				sortDir: ebaSortDir,
				textFilters: toFilterParams(ebaTextFilters),
				selectFilters: toFilterParams(ebaSelectFilters)
			});
			const res = await fetch(`/api/eba?${params}`);
			const data = await res.json();
			if (!data.success || !data.datasetId) return;
			ebaDatasetId = data.datasetId;
			ebaPageItems = data.items;
			ebaCount = data.total;
			ebaPage = data.page;
			ebaFilterOptions = data.filterOptions || {};
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
				sortKey: regafiSortKey,
				sortDir: regafiSortDir,
				textFilters: toFilterParams(regafiTextFilters),
				selectFilters: toFilterParams(regafiSelectFilters)
			});
			const res = await fetch(`/api/regafi?${params}`);
			const data = await res.json();
			if (!data.success || !data.datasetId) return;
			regafiDatasetId = data.datasetId;
			regafiPageItems = data.items;
			regafiCount = data.total;
			regafiPage = data.page;
			regafiFilterOptions = data.filterOptions || {};
		} finally {
			regafiLoading = false;
		}
	}

	function onEbaSortClick(columnKey: DatasetColumnKey, direction: SortDirection) {
		ebaSortKey = columnKey;
		ebaSortDir = direction;
		ebaPage = 1;
		void loadEbaPage();
	}

	function onRegafiSortClick(columnKey: DatasetColumnKey, direction: SortDirection) {
		regafiSortKey = columnKey;
		regafiSortDir = direction;
		regafiPage = 1;
		void loadRegafiPage();
	}

	function onEbaTextFilterChange(key: DatasetColumnKey, value: string) {
		ebaTextFilters = { ...ebaTextFilters, [key]: value };
		ebaPage = 1;
		void loadEbaPage();
	}

	function onRegafiTextFilterChange(key: DatasetColumnKey, value: string) {
		regafiTextFilters = { ...regafiTextFilters, [key]: value };
		regafiPage = 1;
		void loadRegafiPage();
	}

	function onEbaSelectFilterToggle(key: DatasetColumnKey, value: string) {
		const current = ebaSelectFilters[key] ?? [];
		const next = toggleSelectValue(current, value);
		ebaSelectFilters = { ...ebaSelectFilters, [key]: next };
		ebaPage = 1;
		void loadEbaPage();
	}

	function onRegafiSelectFilterToggle(key: DatasetColumnKey, value: string) {
		const current = regafiSelectFilters[key] ?? [];
		const next = toggleSelectValue(current, value);
		regafiSelectFilters = { ...regafiSelectFilters, [key]: next };
		regafiPage = 1;
		void loadRegafiPage();
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
					<div class="overflow-x-auto overflow-y-visible">
						<table class="w-full table-fixed text-sm">
							<thead class="bg-gray-50 sticky top-0">
								<tr>
									{#each EBA_COLUMNS as column}
										<th class={`px-4 py-3 text-left font-medium text-gray-500 ${column.widthClass || ''}`}>
											{#if column.sortable}
												<div class="flex items-center justify-between gap-2">
													<span>{column.label}</span>
													<div class="inline-flex items-center gap-1 text-xs">
														<button
															type="button"
															class={`rounded px-1 py-0.5 hover:bg-gray-200 ${isSortActive(ebaSortKey, ebaSortDir, column.key, 'asc') ? 'bg-gray-200 text-gray-800' : 'text-gray-400'}`}
															aria-label={`Trier ${column.label} en ordre croissant`}
															onclick={() => onEbaSortClick(column.key, 'asc')}
														>
															↑
														</button>
														<button
															type="button"
															class={`rounded px-1 py-0.5 hover:bg-gray-200 ${isSortActive(ebaSortKey, ebaSortDir, column.key, 'desc') ? 'bg-gray-200 text-gray-800' : 'text-gray-400'}`}
															aria-label={`Trier ${column.label} en ordre décroissant`}
															onclick={() => onEbaSortClick(column.key, 'desc')}
														>
															↓
														</button>
													</div>
												</div>
											{:else}
												{column.label}
											{/if}
										</th>
									{/each}
								</tr>
								<tr class="bg-white border-y border-gray-200">
									{#each EBA_COLUMNS as column}
										<th class={`px-4 py-2 ${column.widthClass || ''}`}>
											{#if column.filterType !== 'none'}
												<div class="space-y-1">
													{#if column.filterType === 'text' || column.filterType === 'text-select'}
														<input
															type="text"
															placeholder={`Filtrer ${column.label.toLowerCase()}...`}
															class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
															value={ebaTextFilters[column.key] ?? ''}
															oninput={(event) => onEbaTextFilterChange(column.key, (event.currentTarget as HTMLInputElement).value)}
														/>
													{/if}
													{#if column.filterType === 'select' || column.filterType === 'text-select'}
														<details class="relative">
															<summary class="w-full list-none cursor-pointer px-2 py-1 border border-gray-300 rounded text-xs bg-white text-left hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500">
																{getSelectFilterLabel(ebaSelectFilters, column.key)}
															</summary>
															<div class="absolute left-0 mt-1 w-64 max-h-56 overflow-auto rounded border border-gray-200 bg-white p-2 shadow-lg z-30">
																{#each getSelectOptions(column, ebaFilterOptions) as option}
																	<label class="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-gray-50 cursor-pointer">
																		<input
																			type="checkbox"
																			class="h-3.5 w-3.5"
																			checked={isSelectValueChecked(ebaSelectFilters, column.key, option.value)}
																			onchange={() => onEbaSelectFilterToggle(column.key, option.value)}
																		/>
																		<span class="truncate">{option.label}</span>
																	</label>
																{/each}
															</div>
														</details>
													{/if}
												</div>
											{/if}
										</th>
									{/each}
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each ebaPageItems as entity}
									<tr class="hover:bg-gray-50">
										{#each EBA_COLUMNS as column}
											<td class={`px-4 py-3 ${column.widthClass || ''} ${column.cellClass || ''}`}>
												{entity[column.key] || '-'}
											</td>
										{/each}
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
					<div class="overflow-x-auto overflow-y-visible">
						<table class="w-full table-fixed text-sm">
							<thead class="bg-gray-50 sticky top-0">
								<tr>
									{#each REGAFI_COLUMNS as column}
										<th class={`px-4 py-3 text-left font-medium text-gray-500 ${column.widthClass || ''}`}>
											{#if column.sortable}
												<div class="flex items-center justify-between gap-2">
													<span>{column.label}</span>
													<div class="inline-flex items-center gap-1 text-xs">
														<button
															type="button"
															class={`rounded px-1 py-0.5 hover:bg-gray-200 ${isSortActive(regafiSortKey, regafiSortDir, column.key, 'asc') ? 'bg-gray-200 text-gray-800' : 'text-gray-400'}`}
															aria-label={`Trier ${column.label} en ordre croissant`}
															onclick={() => onRegafiSortClick(column.key, 'asc')}
														>
															↑
														</button>
														<button
															type="button"
															class={`rounded px-1 py-0.5 hover:bg-gray-200 ${isSortActive(regafiSortKey, regafiSortDir, column.key, 'desc') ? 'bg-gray-200 text-gray-800' : 'text-gray-400'}`}
															aria-label={`Trier ${column.label} en ordre décroissant`}
															onclick={() => onRegafiSortClick(column.key, 'desc')}
														>
															↓
														</button>
													</div>
												</div>
											{:else}
												{column.label}
											{/if}
										</th>
									{/each}
								</tr>
								<tr class="bg-white border-y border-gray-200">
									{#each REGAFI_COLUMNS as column}
										<th class={`px-4 py-2 ${column.widthClass || ''}`}>
											{#if column.filterType !== 'none'}
												<div class="space-y-1">
													{#if column.filterType === 'text' || column.filterType === 'text-select'}
														<input
															type="text"
															placeholder={`Filtrer ${column.label.toLowerCase()}...`}
															class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-red-500"
															value={regafiTextFilters[column.key] ?? ''}
															oninput={(event) => onRegafiTextFilterChange(column.key, (event.currentTarget as HTMLInputElement).value)}
														/>
													{/if}
													{#if column.filterType === 'select' || column.filterType === 'text-select'}
														<details class="relative">
															<summary class="w-full list-none cursor-pointer px-2 py-1 border border-gray-300 rounded text-xs bg-white text-left hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-red-500">
																{getSelectFilterLabel(regafiSelectFilters, column.key)}
															</summary>
															<div class="absolute left-0 mt-1 w-64 max-h-56 overflow-auto rounded border border-gray-200 bg-white p-2 shadow-lg z-30">
																{#each getSelectOptions(column, regafiFilterOptions) as option}
																	<label class="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-gray-50 cursor-pointer">
																		<input
																			type="checkbox"
																			class="h-3.5 w-3.5"
																			checked={isSelectValueChecked(regafiSelectFilters, column.key, option.value)}
																			onchange={() => onRegafiSelectFilterToggle(column.key, option.value)}
																		/>
																		<span class="truncate">{option.label}</span>
																	</label>
																{/each}
															</div>
														</details>
													{/if}
												</div>
											{/if}
										</th>
									{/each}
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each regafiPageItems as entity}
									<tr class="hover:bg-gray-50">
										{#each REGAFI_COLUMNS as column}
											<td class={`px-4 py-3 ${column.widthClass || ''} ${column.cellClass || ''}`}>
												{entity[column.key] || '-'}
											</td>
										{/each}
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