<script lang="ts">
	import { onMount } from 'svelte';
	import SourceUpload from '$lib/components/SourceUpload.svelte';
	import type { ComparisonMatch, ComparisonOptions, ComparisonResult, NormalizedEntity, SourceId } from '$lib/types';

	type Side = 'left' | 'right';
	type FilterType = 'none' | 'text' | 'select' | 'text-select';

	interface SourceMeta {
		id: string;
		name: string;
		country: string;
		accentColor: string;
		uploadFormats: string[];
		columns: ColumnDef[];
	}

	interface ColumnDef {
		key: string;
		label: string;
		sortable: boolean;
		filterType: FilterType;
		widthClass?: string;
	}

	interface SelectOption {
		value: string;
		label: string;
		count?: number;
	}

	const SPECIAL_SELECT_OPTIONS: SelectOption[] = [
		{ value: '__all__', label: 'All' },
		{ value: '__empty__', label: 'Empty only' },
		{ value: '__non_empty__', label: 'Exclude empty' }
	];

	const PAGE_SIZE = 10;

	// --- Source metadata ---
	let allSources = $state<SourceMeta[]>([]);
	let sourcesLoaded = $state(false);

	// --- Per-side state ---
	let sources = $state<Record<Side, SourceMeta | null>>({ left: null, right: null });
	let datasetIds = $state<Record<Side, string | null>>({ left: null, right: null });
	let counts = $state<Record<Side, number>>({ left: 0, right: 0 });
	let pageItems = $state<Record<Side, NormalizedEntity[]>>({ left: [], right: [] });
	let pages = $state<Record<Side, number>>({ left: 1, right: 1 });
	let sortKeys = $state<Record<Side, string>>({ left: 'siren', right: 'siren' });
	let sortDirs = $state<Record<Side, string>>({ left: 'asc', right: 'asc' });
	let textFilters = $state<Record<Side, Record<string, string>>>({ left: {}, right: {} });
	let selectFilters = $state<Record<Side, Record<string, string[]>>>({ left: {}, right: {} });
	let filterOptions = $state<Record<Side, Record<string, Array<{ value: string; count: number }>>>>({ left: {}, right: {} });
	let openFilters = $state<Record<Side, string | null>>({ left: null, right: null });
	let loading = $state<Record<Side, boolean>>({ left: false, right: false });
	let loadingMessages = $state<Record<Side, string | null>>({ left: null, right: null });
	let loadingPercents = $state<Record<Side, number | null>>({ left: null, right: null });
	let visibleColumns = $state<Record<Side, Set<string>>>({ left: new Set(), right: new Set() });
	let columnMenuOpen = $state<Record<Side, boolean>>({ left: false, right: false });

	// --- Comparison state ---
	let compareLoading = $state(false);
	let compareOnSiren = $state(true);
	let compareOnName = $state(true);
	let nameSimilarityPercent = $state(80);
	let compareLastSummary = $state<string | null>(null);
	let comparisonEntities = $state<Record<Side, NormalizedEntity[]>>({ left: [], right: [] });
	let comparisonMatches = $state<ComparisonMatch[]>([]);
	let compareSummary = $state<ComparisonResult['summary'] | null>(null);
	let compareFilter = $state<Record<Side, 'total' | 'matches' | 'differences' | 'unique'>>({ left: 'unique', right: 'unique' });
	let crossCheckLoading = $state(false);
	let crossCheckDialogOpen = $state(false);
	let crossCheckRows = $state<CrossCheckRow[]>([]);
	let crossCheckSummary = $state<string | null>(null);
	let crossCheckProgress = $state<string | null>(null);
	let crossCheckCriteriaDialogOpen = $state(false);
	let crossCheckCriteria = $state<CrossCheckCriteria>({ country: 'France' });

	// --- Export state ---
	let error = $state<string | null>(null);
	let exportDialogOpen = $state(false);
	let exportSide = $state<Side>('left');
	let exportSelectedColumns = $state<Set<string>>(new Set());

	// --- Roles tooltip helpers ---
	function getAllRoles(entity: NormalizedEntity): string[] {
		return Array.from(
			new Set(
				(entity.rolesByCountry ?? []).flatMap((entry) => {
					if ('roles' in entry && Array.isArray(entry.roles)) return entry.roles;
					return Object.values(entry).flatMap((v) => (Array.isArray(v) ? v : []));
				}).filter(Boolean)
			)
		).sort((a, b) => a.localeCompare(b, 'fr'));
	}

	function hasTruncatedRoles(entity: NormalizedEntity): boolean {
		return getAllRoles(entity).length > 3;
	}

	// --- Comparison mode ---
	const compareModeActive = $derived(comparisonMatches.length > 0);

	interface CrossCheckRow {
		origin: 'onlyInRight' | 'onlyInLeft';
		status: ComparisonMatch['status'];
		siren: string;
		sourceName: string;
		oppositeName: string;
		sourceCity: string;
		oppositeCity: string;
	}

	interface CrossCheckCriteria {
		country: string;
	}

	// --- Derived helpers ---
	function getVisibleColumns(side: Side): ColumnDef[] {
		const src = sources[side];
		if (!src) return [];
		const visible = visibleColumns[side];
		if (visible.size === 0) return src.columns;
		return src.columns.filter((c) => visible.has(c.key));
	}

	function getCount(side: Side): number {
		return compareModeActive ? getFilteredComparison(side).length : counts[side];
	}



	function getFilteredComparison(side: Side): NormalizedEntity[] {
		if (!compareModeActive) return [];
		const filter = compareFilter[side];
		return comparisonMatches
			.filter((m: ComparisonMatch) => {
				if (filter === 'total') return (side === 'left' ? m.left : m.right) != null;
				if (filter === 'matches') return m.status === 'match';
				if (filter === 'differences') return m.status === 'nameMismatch' || m.status === 'cityMismatch' || m.status === 'categoryMismatch';
				if (filter === 'unique') return side === 'left' ? m.status === 'onlyInLeft' : m.status === 'onlyInRight';
				return false;
			})
			.map((m: ComparisonMatch) => (side === 'left' ? m.left : m.right)!);
	}

	function getSideComparisonStats(side: Side) {
		if (!compareSummary) return null;
		const s = compareSummary;
		return {
			total: side === 'left' ? s.totalLeft : s.totalRight,
			matches: s.totalMatches,
			differences: s.totalNameMismatches + s.totalCityMismatches + s.totalCategoryMismatches,
			unique: side === 'left' ? s.totalOnlyInLeft : s.totalOnlyInRight
		};
	}

	function getDisplayItems(side: Side): NormalizedEntity[] {
		const p = pages[side];
			const items = compareModeActive ? getFilteredComparison(side) : pageItems[side];
		if (compareModeActive) {
			return items.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
		}
		return items;
	}

	function getSideLabel(side: Side): string {
		return sources[side]?.name ?? (side === 'left' ? 'Gauche' : 'Droite');
	}

	function getColorClass(side: Side): string {
		const color = sources[side]?.accentColor ?? 'blue';
		const map: Record<string, string> = {
			blue: 'bg-blue-600 text-white',
			red: 'bg-red-600 text-white',
			green: 'bg-green-600 text-white',
			amber: 'bg-amber-600 text-white',
			purple: 'bg-purple-600 text-white'
		};
		return map[color] ?? map.blue;
	}

	function getBorderColor(side: Side): string {
		const color = sources[side]?.accentColor ?? 'blue';
		const map: Record<string, string> = {
			blue: 'border-blue-600',
			red: 'border-red-600',
			green: 'border-green-600',
			amber: 'border-amber-600',
			purple: 'border-purple-600'
		};
		return map[color] ?? map.blue;
	}

	// --- Source initialization ---
	async function loadSources() {
		try {
			const res = await fetch('/api/sources');
			if (res.ok) {
				allSources = await res.json();
				// Default: left = first source, right = second source
				if (allSources.length >= 2 && !sources.left && !sources.right) {
					setSource('left', allSources[0].id);
					setSource('right', allSources[1].id);
				}
			}
		} catch { /* ignore */ }
		sourcesLoaded = true;
	}

	function setSource(side: Side, sourceId: string) {
		const meta = allSources.find((s) => s.id === sourceId) ?? null;
		sources[side] = meta;
		datasetIds[side] = null;
		counts[side] = 0;
		pageItems[side] = [];
		pages[side] = 1;

		// Init filters from column defs
		const tf: Record<string, string> = {};
		const sf: Record<string, string[]> = {};
		if (meta) {
			for (const col of meta.columns) {
				if (col.filterType === 'text' || col.filterType === 'text-select') tf[col.key] = '';
				if (col.filterType === 'select' || col.filterType === 'text-select') sf[col.key] = [];
			}
			sf['rolesCountry'] = [];
			sf['rolesName'] = [];
		}
		textFilters[side] = tf;
		selectFilters[side] = sf;
		filterOptions[side] = {};
		openFilters[side] = null;

		// Restore column visibility from localStorage
		if (typeof localStorage !== 'undefined') {
			const saved = localStorage.getItem(`columns-${sourceId}`);
			if (saved) {
				try {
					visibleColumns[side] = new Set(JSON.parse(saved));
				} catch { visibleColumns[side] = new Set(); }
			} else {
				visibleColumns[side] = new Set((meta?.columns ?? []).filter((c) => c.key !== 'rolesCountry').map((c) => c.key));
			}
		} else {
			visibleColumns[side] = new Set((meta?.columns ?? []).filter((c) => c.key !== 'rolesCountry').map((c) => c.key));
		}

		// Auto-load latest dataset
		loadLatest(side);
	}

	function handleUploadLoaded(side: Side, payload: { datasetId: string; count: number; sortKey: string }) {
		datasetIds[side] = payload.datasetId;
		counts[side] = payload.count;
		sortKeys[side] = 'siren';
		sortDirs[side] = 'asc';
		pages[side] = 1;
		fetchPage(side);
	}

	async function loadLatest(side: Side) {
		const sourceId = sources[side]?.id;
		if (!sourceId) return;

		loading[side] = true;
		loadingMessages[side] = 'Loading latest dataset...';
		try {
			const res = await fetch(
				`/api/sources/${sourceId}?latest=1&page=1&pageSize=${PAGE_SIZE}&sortKey=${sortKeys[side]}&sortDir=${sortDirs[side]}&textFilters=${encodeURIComponent(JSON.stringify(textFilters[side]))}&selectFilters=${encodeURIComponent(JSON.stringify(selectFilters[side]))}`
			);
			if (!res.ok) return;
			const data = await res.json();
			if (data.success && data.datasetId) {
				datasetIds[side] = data.datasetId;
				counts[side] = data.total;
				pageItems[side] = data.items;
				filterOptions[side] = data.filterOptions ?? {};
			}
		} catch { /* ignore */ }
		loading[side] = false;
		loadingMessages[side] = null;
	}

		async function fetchPage(side: Side) {
			const sourceId = sources[side]?.id;
			const dsId = datasetIds[side];
			if (!sourceId || !dsId) {
				loading[side] = false;
				return;
			}

			loading[side] = true;
			const params = new URLSearchParams({
				datasetId: dsId,
				page: String(pages[side]),
				pageSize: String(PAGE_SIZE),
				sortKey: sortKeys[side],
				sortDir: sortDirs[side],
				textFilters: JSON.stringify(textFilters[side]),
				selectFilters: JSON.stringify(selectFilters[side])
			});

			try {
				const res = await fetch(`/api/sources/${sourceId}?${params}`);
				const data = await res.json();
				if (data.success) {
					console.info('[fetchPage] Loaded', data.items.length, 'items for', side);
					pageItems[side] = data.items;
					counts[side] = data.total;
					filterOptions[side] = data.filterOptions ?? {};
				} else {
					console.error('[fetchPage] API error:', data.error);
					error = data.error || 'Loading error';
				}
			} catch (e) {
				console.error('[fetchPage] Exception:', e);
				error = e instanceof Error ? e.message : 'Network error';
			}
			loading[side] = false;
		}
	function toggleSort(side: Side, key: string) {
		if (sortKeys[side] === key) {
			sortDirs[side] = sortDirs[side] === 'asc' ? 'desc' : 'asc';
		} else {
			sortKeys[side] = key;
			sortDirs[side] = 'asc';
		}
		pages[side] = 1;
		if (compareModeActive) return;
		fetchPage(side);
	}

	function toggleFilterMenu(side: Side, key: string) {
		openFilters[side] = openFilters[side] === key ? null : key;
	}

	function isOpenFilter(side: Side, key: string): boolean {
		return openFilters[side] === key;
	}

	function setTextFilter(side: Side, key: string, value: string) {
		textFilters[side] = { ...textFilters[side], [key]: value };
	}

	function setSelectFilter(side: Side, key: string, values: string[]) {
		selectFilters[side] = { ...selectFilters[side], [key]: values };
	}

	function applyFilters(side: Side) {
		openFilters[side] = null;
		pages[side] = 1;
		if (compareModeActive) return;
		fetchPage(side);
	}

	// --- Column visibility ---
	function toggleColumnMenu(side: Side) {
		columnMenuOpen[side] = !columnMenuOpen[side];
	}

	function toggleColumn(side: Side, key: string) {
		const next = new Set(visibleColumns[side]);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		visibleColumns[side] = next;
		if (typeof localStorage !== 'undefined') {
			const srcId = sources[side]?.id;
			if (srcId) localStorage.setItem(`columns-${srcId}`, JSON.stringify([...next]));
		}
	}

	function showAllColumns(side: Side) {
		const src = sources[side];
		if (!src) return;
		visibleColumns[side] = new Set(src.columns.filter((c) => c.key !== 'rolesCountry').map((c) => c.key));
	}

	function hideAllColumns(side: Side) {
		visibleColumns[side] = new Set();
	}

	// --- Comparison ---
	async function runFilteredComparison() {
		const leftSrc = sources.left?.id;
		const rightSrc = sources.right?.id;
		const leftDsId = datasetIds.left;
		const rightDsId = datasetIds.right;
		if (!leftSrc || !rightSrc || !leftDsId || !rightDsId) return;

		compareLoading = true;
		try {
			const res = await fetch('/api/compare', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					leftDatasetId: leftDsId,
					rightDatasetId: rightDsId,
					leftSource: leftSrc,
					rightSource: rightSrc,
					leftTextFilters: textFilters.left,
					leftSelectFilters: selectFilters.left,
					rightTextFilters: textFilters.right,
					rightSelectFilters: selectFilters.right,
					options: {
						columns: [
							...(compareOnSiren ? ['siren' as const] : []),
							...(compareOnName ? ['denomination' as const] : [])
						],
						nameSimilarityThreshold: nameSimilarityPercent / 100
					} satisfies Partial<ComparisonOptions>
				})
			});
			const data = await res.json();
			if (data.success) {
				comparisonMatches = data.matches;
				comparisonEntities.left = data.matches
					.filter((m: ComparisonMatch) => m.status === 'onlyInLeft')
					.map((m: ComparisonMatch) => m.left!);
				comparisonEntities.right = data.matches
					.filter((m: ComparisonMatch) => m.status === 'onlyInRight')
					.map((m: ComparisonMatch) => m.right!);
				pages.left = 1;
				pages.right = 1;
				compareSummary = data.summary;
				const s = data.summary;
				compareLastSummary = `${s.totalMatches} matchs, ${s.totalOnlyInLeft} uniq. gauche, ${s.totalOnlyInRight} uniq. droite`;
			}
		} catch { /* ignore */ }
		compareLoading = false;
	}

	async function openCrossCheckCriteriaDialog() {
		crossCheckCriteriaDialogOpen = true;
	}

	async function runCrossCheck() {
		crossCheckCriteriaDialogOpen = false;
		crossCheckLoading = true;
		try {
			const leftRes = await fetch(`/api/sources/${sources.left?.id}?latest=1&page=1&pageSize=100000`);
			const rightRes = await fetch(`/api/sources/${sources.right?.id}?latest=1&page=1&pageSize=100000`);
			const leftData = await leftRes.json();
			const rightData = await rightRes.json();

			const leftAll: NormalizedEntity[] = leftData.items ?? [];
			const rightAll: NormalizedEntity[] = rightData.items ?? [];

			// Cross-check: for each entity in left (onlyInLeft), search by name in right full list
			const rows: CrossCheckRow[] = [];
			for (const leftEntity of comparisonEntities.left) {
				const match = rightAll.find((r) =>
					r.denomination.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') ===
					leftEntity.denomination.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
				);
				if (match) {
					rows.push({
						origin: 'onlyInLeft',
						status: 'match',
						siren: leftEntity.siren || match.siren,
						sourceName: leftEntity.denomination,
						oppositeName: match.denomination,
						sourceCity: leftEntity.ville ?? '-',
						oppositeCity: match.ville ?? '-'
					});
				}
			}
			for (const rightEntity of comparisonEntities.right) {
				const match = leftAll.find((l) =>
					l.denomination.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') ===
					rightEntity.denomination.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
				);
				if (match) {
					rows.push({
						origin: 'onlyInRight',
						status: 'match',
						siren: rightEntity.siren || match.siren,
						sourceName: rightEntity.denomination,
						oppositeName: match.denomination,
						sourceCity: rightEntity.ville ?? '-',
						oppositeCity: match.ville ?? '-'
					});
				}
			}
			crossCheckRows = rows;
			crossCheckSummary = `${rows.length} sociétés trouvées dans la liste complète opposée`;
			crossCheckDialogOpen = true;
		} catch { /* ignore */ }
		crossCheckLoading = false;
	}

	function clearComparisonMode() {
		comparisonEntities = { left: [], right: [] };
		comparisonMatches = [];
		compareLastSummary = null;
		compareSummary = null;
		compareFilter = { left: 'unique', right: 'unique' };
		crossCheckDialogOpen = false;
		crossCheckRows = [];
		crossCheckSummary = null;
		crossCheckProgress = null;
		crossCheckCriteriaDialogOpen = false;
	}

	function clampNameSimilarity(raw: string): void {
		const parsed = Number(raw);
		if (!Number.isFinite(parsed)) return;
		nameSimilarityPercent = Math.min(100, Math.max(0, Math.round(parsed)));
	}

	// --- Export ---
	function openExportDialog(side: Side) {
		const src = sources[side];
		if (!src) return;
		exportSide = side;
		exportSelectedColumns = new Set(getVisibleColumns(side).map((c) => c.key));
		exportDialogOpen = true;
	}

	function toggleExportColumn(key: string) {
		const next = new Set(exportSelectedColumns);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		exportSelectedColumns = next;
	}

	async function exportToCsv() {
		const side = exportSide;
		const src = sources[side];
		const dsId = datasetIds[side];
		if (!src || !dsId) return;

		const cols = src.columns.filter((c) => exportSelectedColumns.has(c.key));
		if (cols.length === 0) return;

		const params = new URLSearchParams({
			export: 'csv',
			datasetId: dsId,
			columns: cols.map((c) => c.key).join(','),
			sortKey: sortKeys[side],
			sortDir: sortDirs[side],
			textFilters: JSON.stringify(textFilters[side]),
			selectFilters: JSON.stringify(selectFilters[side])
		});

		const link = document.createElement('a');
		const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
		link.href = `/api/sources/${src.id}?${params}`;
		link.download = `${src.id}-export-${timestamp}.csv`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		exportDialogOpen = false;
	}

	function escapeCsv(value: string | null | undefined): string {
		const normalized = value ?? '';
		return `"${normalized.replace(/"/g, '""')}"`;
	}

	// --- Value extraction ---
	function deriveRolesSummary(entity: NormalizedEntity): string {
		if (entity.rolesSummary?.trim()) return entity.rolesSummary;
		const roles = Array.from(
			new Set(
				(entity.rolesByCountry ?? []).flatMap((entry) => {
					if ('roles' in entry && Array.isArray(entry.roles)) return entry.roles;
					return Object.values(entry).flatMap((v) => (Array.isArray(v) ? v : []));
				}).filter(Boolean)
			)
		).sort((a, b) => a.localeCompare(b, 'fr'));
		if (roles.length === 0) return '-';
		const visible = roles.slice(0, 3);
		return roles.length > visible.length ? `${visible.join(', ')} +${roles.length - visible.length}` : visible.join(', ');
	}

	function getCellValue(entity: NormalizedEntity, key: string): string {
		if (key === 'rolesSummary') return deriveRolesSummary(entity);
		if (key === 'rolesCountry' || key === 'rolesName') return '-';
		if (key.startsWith('extra:')) {
			const val = entity.extra?.[key.slice(6)];
			return val ?? '-';
		}
		const raw = (entity as unknown as Record<string, unknown>)[key];
		return raw === null || raw === undefined || raw === '' ? '-' : String(raw);
	}

	// --- Filter helpers ---
	function getSelectOptions(side: Side, key: string): SelectOption[] {
		const dynamic = (filterOptions[side][key] ?? []).map((v) => {
			if (typeof v === 'string') return { value: v, label: v };
			return { value: v.value, label: v.value, count: v.count };
		});
		return [...SPECIAL_SELECT_OPTIONS.filter((o) => o.value !== '__all__'), ...dynamic];
	}

	function getSelectFilterLabel(side: Side, key: string): string {
		const selected = selectFilters[side][key] ?? [];
		if (selected.length === 0) return 'All';
		if (selected.length === 1) {
			const special = SPECIAL_SELECT_OPTIONS.find((o) => o.value === selected[0]);
			return special?.label ?? selected[0];
		}
		return `${selected.length} selections`;
	}

	function toggleSelectValue(side: Side, key: string, value: string) {
		const current = selectFilters[side][key] ?? [];
		const set = new Set(current);
		if (set.has(value)) set.delete(value);
		else set.add(value);
		setSelectFilter(side, key, [...set]);
	}

	function isSelectChecked(side: Side, key: string, value: string): boolean {
		return (selectFilters[side][key] ?? []).includes(value);
	}

	// --- Lifecycle ---
	onMount(() => {
		loadSources();
	});
</script>

<div class="space-y-6">
	<!-- Comparison Controls -->
	<div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white p-4">
		<div class="flex flex-wrap items-center gap-4">
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={compareOnSiren} class="rounded" />
				Compare by SIREN
			</label>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={compareOnName} class="rounded" />
				Compare by name
			</label>
			<div class="flex items-center gap-2 text-sm">
				<span>Name similarity threshold:</span>
				<input
					type="number"
					min="0"
					max="100"
					value={nameSimilarityPercent}
					oninput={(e) => clampNameSimilarity((e.target as HTMLInputElement).value)}
					class="w-16 rounded border px-1 py-0.5 text-center text-sm"
				/>
				<span>%</span>
			</div>
		</div>
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
				onclick={runFilteredComparison}
				disabled={compareLoading}
			>
				{compareLoading ? 'Comparing...' : 'Compare active filters'}
			</button>
			<button
				type="button"
				class="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
				onclick={openCrossCheckCriteriaDialog}
				disabled={!compareModeActive || crossCheckLoading}
			>
				Search in full lists
			</button>
			{#if compareModeActive}
				<button
					type="button"
					class="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
					onclick={clearComparisonMode}
				>
					Back to filtered tables
				</button>
			{/if}
		</div>
	</div>

	{#if error}
		<p class="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>
	{/if}

	<!-- Two Tables -->
	<div class="flex flex-col gap-6">
		{#each (['left', 'right'] as const) as side}
			{@const s = side}
			<div class="flex flex-col">
				<!-- Table Header -->
				<div class="flex items-center justify-between mb-2">
					<div class="flex items-center gap-2">
						<span class="text-lg font-bold {getColorClass(s)} rounded px-3 py-1">
							{getSideLabel(s)} ({getCount(s)})
						</span>
						<!-- Source Selector -->
						{#if allSources.length > 1}
							<select
								class="rounded border border-gray-300 px-2 py-1 text-sm"
								value={sources[s]?.id ?? ''}
								onchange={(e) => setSource(s, (e.target as HTMLSelectElement).value)}
							>
								{#each allSources as src}
									<option value={src.id}>{src.name}</option>
								{/each}
							</select>
						{/if}
					</div>
					<div class="flex items-center gap-2">
						<!-- Column visibility toggle -->
						<div class="relative">
							<button
								type="button"
								class="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
								onclick={() => toggleColumnMenu(s)}
							>
								Colonnes
							</button>
							{#if columnMenuOpen[s]}
								<div class="absolute right-0 z-40 mt-1 w-64 rounded border border-gray-300 bg-white p-2 shadow-lg">
									<div class="flex gap-2 mb-2">
										<button class="text-xs text-blue-600 hover:underline" onclick={() => showAllColumns(s)}>All</button>
										<button class="text-xs text-red-600 hover:underline" onclick={() => hideAllColumns(s)}>None</button>
									</div>
									<div class="max-h-64 overflow-y-auto">
										{#each (sources[s]?.columns ?? []) as col}
											<label class="flex items-center gap-2 py-0.5 text-xs hover:bg-gray-50 px-1 rounded whitespace-nowrap">
												<input
													type="checkbox"
													checked={visibleColumns[s].has(col.key)}
													onchange={() => toggleColumn(s, col.key)}
													class="rounded"
												/>
												{col.label}
											</label>
										{/each}
									</div>
								</div>
							{/if}
						</div>
						<!-- Export button -->
						<button
							type="button"
							class="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
							onclick={() => openExportDialog(s)}
						>
							Exporter
						</button>
						<!-- Upload -->
						{#if sources[s]}
							<SourceUpload
								sourceId={sources[s]!.id}
								sourceName={sources[s]!.name}
								accentColor={sources[s]!.accentColor}
								uploadFormats={sources[s]!.uploadFormats as Array<'json' | 'csv'>}
								onLoaded={(payload) => handleUploadLoaded(s, payload)}
							/>
						{/if}
					</div>
				</div>

						<!-- Comparison stats bar -->
						{#if compareModeActive && compareSummary}
							{@const sideStats = getSideComparisonStats(s)}
							{#if sideStats}
								{@const active = compareFilter[side]}
								<div class="flex items-center justify-center gap-1 mb-2">
									<button
										type="button"
										class="rounded px-2 py-0.5 text-xs border transition {active === 'total' ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'}"
										onclick={() => { compareFilter.left = 'total'; compareFilter.right = 'total'; pages.left = 1; pages.right = 1; }}
									>
										Total: {sideStats.total.toLocaleString()}
									</button>
									<button
										type="button"
										class="rounded px-2 py-0.5 text-xs border transition {active === 'matches' ? 'bg-green-700 text-white border-green-700' : 'bg-white text-green-700 border-green-300 hover:bg-green-50'}"
										onclick={() => { compareFilter.left = 'matches'; compareFilter.right = 'matches'; pages.left = 1; pages.right = 1; }}
									>
										Identical: {sideStats.matches.toLocaleString()}
									</button>
									<button
										type="button"
										class="rounded px-2 py-0.5 text-xs border transition {active === 'differences' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'}"
										onclick={() => { compareFilter.left = 'differences'; compareFilter.right = 'differences'; pages.left = 1; pages.right = 1; }}
									>
										Different: {sideStats.differences.toLocaleString()}
									</button>
									<button
										type="button"
										class="rounded px-2 py-0.5 text-xs border transition {active === 'unique' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-700 border-red-300 hover:bg-red-50'}"
										onclick={() => { compareFilter.left = 'unique'; compareFilter.right = 'unique'; pages.left = 1; pages.right = 1; }}
									>
										Unique: {sideStats.unique.toLocaleString()}
									</button>
								</div>
							{/if}
						{/if}
				<!-- Loading -->
				{#if loading[s] && !datasetIds[s] && pageItems[side].length === 0}
					<div class="text-center py-8 text-sm text-gray-500">
						{loadingMessages[s] ?? 'Loading...'}
						{#if loadingPercents[s] !== null}
							<div class="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
								<div class="h-full rounded-full {getColorClass(s)}" style="width: {loadingPercents[s]}%"></div>
							</div>
						{/if}
					</div>
				{:else}
					<!-- Table -->
					<div class="relative overflow-x-auto rounded-lg border border-gray-200">
						<!-- Page-loading overlay -->
						{#if loading[s]}
							<div class="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-sm">
								<div class="flex flex-col items-center gap-2 rounded-lg bg-white px-4 py-3 shadow-lg border border-gray-200">
									<svg class="h-6 w-6 animate-spin text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
										<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
										<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
								<p class="text-sm text-gray-600">Loading...</p>
							</div>
						</div>
						{/if}
						<table class="min-w-full text-sm">
							<thead class="bg-gray-50">
								<tr>
									{#each getVisibleColumns(s) as col (col.key)}
										<th class="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap {col.widthClass ?? ''}">
											<div class="flex items-center gap-1">
												{#if col.sortable}
													<button
														type="button"
														class="hover:text-gray-700"
														onclick={() => toggleSort(s, col.key)}
													>
														{col.label}
														{#if sortKeys[s] === col.key}
															{sortDirs[s] === 'asc' ? ' ▲' : ' ▼'}
														{/if}
													</button>
												{:else}
													<span>{col.label}</span>
												{/if}
											</div>
											<!-- Filter -->
											{#if col.filterType !== 'none'}
												<div class="relative mt-1" data-filter-side={s} data-filter-key={col.key}>
													<button
														type="button"
														class="text-xs text-gray-400 hover:text-gray-600"
														onclick={() => toggleFilterMenu(s, col.key)}
													>
														{#if col.filterType === 'text'}
															🔍
														{:else if col.filterType === 'text-select'}
															🔍▼
														{:else}
															▼
														{/if}
													</button>
													{#if isOpenFilter(s, col.key)}
														<div class="absolute left-0 z-30 mt-1 min-w-56 max-h-[80vh] resize overflow-y-auto rounded border border-gray-300 bg-white p-2 shadow-lg">
															{#if col.filterType === 'text' || col.filterType === 'text-select'}
																<input
																	type="text"
																	class="w-full rounded border border-gray-200 px-2 py-1 text-xs"
																	placeholder="Search..."
																	value={textFilters[s][col.key] ?? ''}
																	oninput={(e) => setTextFilter(s, col.key, (e.target as HTMLInputElement).value)}
																/>
															{/if}
															{#if col.filterType === 'select' || col.filterType === 'text-select'}
																<div class="mt-1 max-h-40 overflow-y-auto">
																	{#each getSelectOptions(s, col.key) as opt}
																		<label class="flex items-center gap-2 py-0.5 text-xs hover:bg-gray-50 px-1 rounded whitespace-nowrap">
																			<input
																				type="checkbox"
																				checked={isSelectChecked(s, col.key, opt.value)}
																				onchange={() => toggleSelectValue(s, col.key, opt.value)}
																				class="rounded"
																			/>
																			{opt.label}{#if opt.count != null} <span class="text-gray-400">({opt.count.toLocaleString()})</span>{/if}
																		</label>
																	{/each}
																</div>
																																<button
																																	type="button"
																																	class="mt-1 block w-full text-left px-1 py-0.5 text-xs text-gray-400 hover:text-gray-600"
																																	onclick={() => setSelectFilter(s, col.key, [])}
																																>
																																	Deselect all
																																</button>
															{/if}
															<button
																type="button"
																class="mt-2 block w-full rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
																onclick={() => applyFilters(s)}
															>
																Appliquer
															</button>
														</div>
													{/if}
												</div>
											{/if}
										</th>
									{/each}
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 bg-white">
								{#each getDisplayItems(s) as entity, i (entity.siren + '-' + entity.denomination + '-' + i)}
									<tr class="hover:bg-gray-50">
										{#each getVisibleColumns(s) as col (col.key)}
											<td class="px-3 py-2 whitespace-nowrap text-gray-900" class:font-mono={col.key === 'siren' || col.key === 'lei'}>
												{#if col.key === 'rolesSummary' && hasTruncatedRoles(entity)}
	<span class="roles-cell group relative cursor-help">
		{getCellValue(entity, col.key)}
		<span class="roles-tooltip invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all delay-[1500ms] duration-150 absolute bottom-full left-0 z-50 mb-1 max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-lg">
			<span class="mb-1 block font-semibold text-gray-700">{entity.denomination || entity.siren}</span>
			<span class="flex flex-wrap gap-1 text-gray-600">
				{#each getAllRoles(entity) as role}
					<span class="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">{role}</span>
				{/each}
			</span>
		</span>
	</span>
{:else}
	{getCellValue(entity, col.key)}
{/if}
											</td>
										{/each}
									</tr>
								{/each}
								{#if getDisplayItems(s).length === 0}
									<tr>
										<td colspan={getVisibleColumns(s).length || 1} class="px-3 py-8 text-center text-gray-500">
											{#if datasetIds[s]}
												No results
											{:else}
												Import a file to start
											{/if}
										</td>
									</tr>
								{/if}
							</tbody>
						</table>
					</div>

					<!-- Pagination -->
					{#if getCount(s) > PAGE_SIZE}
						<div class="mt-2 flex items-center justify-between text-sm">
							<span class="text-gray-500">
								Page {pages[s]} / {Math.ceil(getCount(s) / PAGE_SIZE)}
							</span>
							<div class="flex gap-1">
								<button
									type="button"
									class="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-30"
									disabled={pages[s] <= 1}
									onclick={() => { pages[s]--; if (!compareModeActive) fetchPage(s); }}
								>
									Prec.
								</button>
								<button
									type="button"
									class="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-30"
									disabled={pages[s] >= Math.ceil(getCount(s) / PAGE_SIZE)}
									onclick={() => { pages[s]++; if (!compareModeActive) fetchPage(s); }}
								>
									Suiv.
								</button>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
</div>

<!-- Cross-Check Dialog -->
{#if crossCheckDialogOpen}
	<div class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-12 p-4">
		<div class="w-full max-w-2xl rounded-lg bg-white p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-lg font-semibold">Search in full lists</h3>
				<button class="text-gray-400 hover:text-gray-600" onclick={() => (crossCheckDialogOpen = false)}>✕</button>
			</div>
			{#if crossCheckSummary}
				<p class="mb-3 text-sm text-blue-600">{crossCheckSummary}</p>
			{/if}
			{#if crossCheckRows.length > 0}
				<table class="w-full text-sm">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-3 py-2 text-left">Origine</th>
							<th class="px-3 py-2 text-left">SIREN</th>
							<th class="px-3 py-2 text-left">Nom source</th>
							<th class="px-3 py-2 text-left">Nom oppose</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each crossCheckRows as row}
							<tr>
								<td class="px-3 py-2 text-xs">
									{row.origin === 'onlyInLeft' ? getSideLabel('left') : getSideLabel('right')}
								</td>
								<td class="px-3 py-2 font-mono text-xs">{row.siren}</td>
								<td class="px-3 py-2">{row.sourceName}</td>
								<td class="px-3 py-2">{row.oppositeName}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="text-sm text-gray-500">No matches found.</p>
			{/if}
		</div>
	</div>
{/if}

<!-- Cross-Check Criteria Dialog -->
{#if crossCheckCriteriaDialogOpen}
	<div class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-12 p-4">
		<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
			<h3 class="text-lg font-semibold mb-4">Cross search</h3>
			<p class="text-sm text-gray-600 mb-4">
				This operation loads the full lists (without filters) from both sources and searches
				les entites marquees comme "uniquement a gauche/droite" par leur denomination.
			</p>
			<div class="flex justify-end gap-2">
				<button
					type="button"
					class="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
					onclick={() => (crossCheckCriteriaDialogOpen = false)}
				>
					Annuler
				</button>
				<button
					type="button"
					class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
					onclick={runCrossCheck}
				>
					Run search
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Export Dialog -->
{#if exportDialogOpen}
	<div class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-12 p-4">
		<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
			<h3 class="text-lg font-semibold mb-4">Exporter {getSideLabel(exportSide)}</h3>
			<div class="max-h-64 overflow-y-auto mb-4">
				{#each (sources[exportSide]?.columns ?? []) as col}
					<label class="flex items-center gap-2 py-1 text-sm hover:bg-gray-50 px-1 rounded">
						<input
							type="checkbox"
							checked={exportSelectedColumns.has(col.key)}
							onchange={() => toggleExportColumn(col.key)}
							class="rounded"
						/>
						{col.label}
					</label>
				{/each}
			</div>
			<div class="flex justify-end gap-2">
				<button
					type="button"
					class="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
					onclick={() => (exportDialogOpen = false)}
				>
					Annuler
				</button>
				<button
					type="button"
					class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
					onclick={exportToCsv}
				>
					Exporter CSV
				</button>
			</div>
		</div>
	</div>
{/if}
