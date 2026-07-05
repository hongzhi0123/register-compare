<script lang="ts">
	import { onMount } from 'svelte';
	import EbaUpload from '$lib/components/EbaUpload.svelte';
	import RegafiUpload from '$lib/components/RegafiUpload.svelte';
	import type { ComparisonMatch, ComparisonOptions, ComparisonResult, NormalizedEntity } from '$lib/types';

	type DatasetColumnKey =
		| 'siren'
		| 'denomination'
		| 'ville'
		| 'pays'
		| 'categorie'
		| 'rolesSummary'
		| 'rolesCountry'
		| 'rolesName'
		| 'entityCode'
		| 'lei'
		| 'idReferentiel';
	type SortKey = DatasetColumnKey | 'none';
	type SortDirection = 'asc' | 'desc';
	type FilterType = 'none' | 'text' | 'select' | 'text-select';
	type SelectFilterValue = string[];
	type DatasetKind = 'eba' | 'regafi';

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

	interface CrossCheckRow {
		origin: 'onlyInEba' | 'onlyInRegafi';
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

	const EBA_COLUMNS: TableColumn[] = [
		{ key: 'siren', label: 'SIREN', sortable: true, filterType: 'text-select', widthClass: 'w-28', cellClass: 'font-mono' },
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
		{
			key: 'rolesSummary',
			label: 'Rôles PSD2',
			sortable: true,
			filterType: 'none',
			widthClass: 'w-64',
			cellClass: 'truncate max-w-64'
		},
		{ key: 'entityCode', label: 'Code EBA', sortable: true, filterType: 'text-select', widthClass: 'w-36', cellClass: 'font-mono text-xs' }
	];

	const REGAFI_COLUMNS: TableColumn[] = [
		{ key: 'siren', label: 'SIREN', sortable: true, filterType: 'text-select', widthClass: 'w-28', cellClass: 'font-mono' },
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
		{
			key: 'rolesSummary',
			label: 'Rôles PSD2',
			sortable: true,
			filterType: 'none',
			widthClass: 'w-64',
			cellClass: 'truncate max-w-64'
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
			return SPECIAL_SELECT_OPTIONS.filter((option) => option.value !== '__all__');
		}

		const dynamic = (filterOptions[column.key] ?? []).map((value) => ({ value, label: value }));
		return [...SPECIAL_SELECT_OPTIONS.filter((option) => option.value !== '__all__'), ...dynamic];
	}

	function getSelectableValues(
		column: TableColumn,
		filterOptions: Partial<Record<DatasetColumnKey, string[]>>
	): string[] {
		return getSelectOptions(column, filterOptions).map((option) => option.value);
	}

	function getRoleSelectOptions(values: string[]): SelectOption[] {
		const dynamic = Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))).map((value) => ({
			value,
			label: value
		}));
		return [...SPECIAL_SELECT_OPTIONS.filter((option) => option.value !== '__all__'), ...dynamic];
	}

	function getRoleSelectableValues(values: string[]): string[] {
		return getRoleSelectOptions(values).map((option) => option.value);
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
		return selected.includes(value);
	}

	function setAllSelectValues(
		column: TableColumn,
		filterOptions: Partial<Record<DatasetColumnKey, string[]>>
	): string[] {
		return getSelectableValues(column, filterOptions);
	}

	function toggleSelectValue(current: string[], value: string): string[] {

		const selected = new Set(current);
		if (selected.has(value)) {
			selected.delete(value);
		} else {
			selected.add(value);
		}

		return Array.from(selected);
	}

	function getFilterButtonLabel(
		filters: Partial<Record<DatasetColumnKey, SelectFilterValue>>,
		key: DatasetColumnKey
	): string {
		return getSelectFilterLabel(filters, key);
	}

	function isClickInsideActiveFilter(
		eventTarget: EventTarget | null,
		kind: 'eba' | 'regafi',
		key: DatasetColumnKey
	): boolean {
		return eventTarget instanceof Element && !!eventTarget.closest(`[data-filter-kind="${kind}"][data-filter-key="${key}"]`);
	}

	function isSortActive(sortKey: SortKey, sortDir: SortDirection, key: DatasetColumnKey, dir: SortDirection): boolean {
		return sortKey === key && sortDir === dir;
	}

	function deriveRolesSummary(entity: NormalizedEntity): string {
		if (entity.rolesSummary && entity.rolesSummary.trim()) return entity.rolesSummary;
		const roles = Array.from(
			new Set(
				(entity.rolesByCountry ?? []).flatMap((entry) => {
					if ('roles' in entry && Array.isArray(entry.roles)) {
						return entry.roles;
					}
					return Object.values(entry).flatMap((value) => (Array.isArray(value) ? value : []));
				}).filter(Boolean)
			)
		).sort((a, b) => a.localeCompare(b, 'fr'));
		if (roles.length === 0) return '-';
		const visible = roles.slice(0, 3);
		const hiddenCount = roles.length - visible.length;
		return hiddenCount > 0 ? `${visible.join(', ')} +${hiddenCount}` : visible.join(', ');
	}

	function getColumnValue(entity: NormalizedEntity, key: DatasetColumnKey): string {
		if (key === 'rolesSummary') return deriveRolesSummary(entity);
		if (key === 'rolesCountry' || key === 'rolesName') return '-';
		const raw = entity[key];
		return raw === null || raw === undefined || raw === '' ? '-' : String(raw);
	}

	function sortEntities(items: NormalizedEntity[], sortKey: SortKey, sortDir: SortDirection): NormalizedEntity[] {
		if (sortKey === 'none') return [...items];
		return [...items].sort((left, right) => {
			const l = getColumnValue(left, sortKey);
			const r = getColumnValue(right, sortKey);
			const result = l.localeCompare(r, 'fr', { sensitivity: 'base' });
			return sortDir === 'desc' ? -result : result;
		});
	}

	function getStatusLabel(status: ComparisonMatch['status']): string {
		if (status === 'match') return 'Correspondance';
		if (status === 'nameMismatch') return 'Nom différent';
		if (status === 'onlyInEba') return 'Uniquement EBA';
		if (status === 'onlyInRegafi') return 'Uniquement REGAFI';
		if (status === 'cityMismatch') return 'Ville différente';
		return 'Catégorie différente';
	}

	function getStatusBadgeClass(status: ComparisonMatch['status']): string {
		if (status === 'match') return 'bg-green-100 text-green-800';
		if (status === 'nameMismatch') return 'bg-amber-100 text-amber-800';
		if (status === 'onlyInEba' || status === 'onlyInRegafi') return 'bg-red-100 text-red-800';
		return 'bg-gray-100 text-gray-700';
	}

	function escapeCsv(value: string | null | undefined): string {
		const normalized = value ?? '';
		const escaped = normalized.replace(/"/g, '""');
		return `"${escaped}"`;
	}

	async function exportDatasetTableToCsv(kind: DatasetKind): Promise<void> {
		const columns = kind === 'eba' ? EBA_COLUMNS : REGAFI_COLUMNS;
		const isEba = kind === 'eba';
		const setLoading = isEba ? (value: boolean) => (ebaExportLoading = value) : (value: boolean) => (regafiExportLoading = value);

		setLoading(true);
		try {
			const items = compareModeActive
				? (isEba ? ebaComparisonEntities : regafiComparisonEntities)
				: await fetchEntities(kind, true);

			if (items.length === 0) return;

			const header = columns.map((column) => escapeCsv(column.label)).join(',');
			const rows = items.map((entity) =>
				columns
					.map((column) => {
						const raw = getColumnValue(entity, column.key);
						return escapeCsv(raw === '-' ? '' : raw);
					})
					.join(',')
			);

			const csvContent = [header, ...rows].join('\n');
			const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
			link.href = url;
			link.download = `${kind}-${compareModeActive ? 'comparison' : 'filtered'}-${timestamp}.csv`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		} finally {
			setLoading(false);
		}
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
	let ebaExportLoading = $state(false);
	let regafiExportLoading = $state(false);
	let ebaLoadingMessage = $state<string | null>(null);
	let ebaLoadingPercent = $state<number | null>(null);
	let regafiLoadingMessage = $state<string | null>(null);
	let regafiLoadingPercent = $state<number | null>(null);

	const PAGE_SIZE = 10;
	let ebaPage = $state(1);
	let regafiPage = $state(1);

	let ebaSortKey = $state<SortKey>('siren');
	let regafiSortKey = $state<SortKey>('siren');
	let ebaSortDir = $state<SortDirection>('asc');
	let regafiSortDir = $state<SortDirection>('asc');

	let ebaTextFilters = $state<Partial<Record<DatasetColumnKey, string>>>(createTextFilters(EBA_COLUMNS));
	let regafiTextFilters = $state<Partial<Record<DatasetColumnKey, string>>>(createTextFilters(REGAFI_COLUMNS));
	let ebaSelectFilters = $state<Partial<Record<DatasetColumnKey, SelectFilterValue>>>({
		...createSelectFilters(EBA_COLUMNS),
		rolesCountry: [],
		rolesName: []
	});
	let regafiSelectFilters = $state<Partial<Record<DatasetColumnKey, SelectFilterValue>>>({
		...createSelectFilters(REGAFI_COLUMNS),
		rolesCountry: [],
		rolesName: []
	});
	let ebaFilterOptions = $state<Partial<Record<DatasetColumnKey, string[]>>>({});
	let regafiFilterOptions = $state<Partial<Record<DatasetColumnKey, string[]>>>({});
	let ebaOpenFilter = $state<DatasetColumnKey | null>(null);
	let regafiOpenFilter = $state<DatasetColumnKey | null>(null);
	let compareLoading = $state(false);
	let compareOnSiren = $state(true);
	let compareOnName = $state(true);
	let nameSimilarityPercent = $state(80);
	let compareLastSummary = $state<string | null>(null);
	let ebaComparisonEntities = $state<NormalizedEntity[]>([]);
	let regafiComparisonEntities = $state<NormalizedEntity[]>([]);
	let comparisonMatches = $state<ComparisonMatch[]>([]);
	let crossCheckLoading = $state(false);
	let crossCheckDialogOpen = $state(false);
	let crossCheckRows = $state<CrossCheckRow[]>([]);
	let crossCheckSummary = $state<string | null>(null);
	let crossCheckProgress = $state<string | null>(null);
	let crossCheckCriteriaDialogOpen = $state(false);
	let crossCheckCriteria = $state<CrossCheckCriteria>({ country: 'France' });

	const compareModeActive = $derived(ebaComparisonEntities.length > 0 || regafiComparisonEntities.length > 0);
	const displayEbaCount = $derived(compareModeActive ? ebaComparisonEntities.length : ebaCount);
	const displayRegafiCount = $derived(compareModeActive ? regafiComparisonEntities.length : regafiCount);
	const displayEbaItems = $derived(
		compareModeActive
			? ebaComparisonEntities.slice((ebaPage - 1) * PAGE_SIZE, ebaPage * PAGE_SIZE)
			: ebaPageItems
	);
	const displayRegafiItems = $derived(
		compareModeActive
			? regafiComparisonEntities.slice((regafiPage - 1) * PAGE_SIZE, regafiPage * PAGE_SIZE)
			: regafiPageItems
	);
	function clearComparisonMode() {
		ebaComparisonEntities = [];
		regafiComparisonEntities = [];
		comparisonMatches = [];
		compareLastSummary = null;
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

	async function fetchEntities(
		kind: DatasetKind,
		useActiveFilters: boolean,
		overrideTextFilters: Partial<Record<DatasetColumnKey, string>> = {},
		overrideSelectFilters: Partial<Record<DatasetColumnKey, string[]>> = {},
		onProgress?: (page: number, totalPages: number) => void
	): Promise<NormalizedEntity[]> {
		const datasetId = kind === 'eba' ? ebaDatasetId : regafiDatasetId;
		if (!datasetId) return [];

		const textFilters = useActiveFilters
			? (kind === 'eba' ? ebaTextFilters : regafiTextFilters)
			: overrideTextFilters;
		const selectFilters = useActiveFilters
			? (kind === 'eba' ? ebaSelectFilters : regafiSelectFilters)
			: overrideSelectFilters;
		const sortKey = kind === 'eba' ? ebaSortKey : regafiSortKey;
		const sortDir = kind === 'eba' ? ebaSortDir : regafiSortDir;

		let page = 1;
		let totalPages = 1;
		const all: NormalizedEntity[] = [];

		while (page <= totalPages) {
			const params = new URLSearchParams({
				datasetId,
				page: String(page),
				pageSize: '100',
				sortKey,
				sortDir,
				textFilters: toFilterParams(textFilters),
				selectFilters: toFilterParams(selectFilters)
			});

			const response = await fetch(`/api/${kind}?${params}`);
			const data = await response.json();
			if (!data.success) {
				throw new Error(data.error || `Erreur lors du chargement ${kind.toUpperCase()}`);
			}

			all.push(...(data.items ?? []));
			totalPages = Number(data.totalPages ?? 1);
			onProgress?.(page, totalPages);
			page += 1;
		}

		return all;
	}

	function openCrossCheckCriteriaDialog() {
		if (!compareModeActive || comparisonMatches.length === 0) {
			error = 'Lancez d\'abord une comparaison filtrée.';
			return;
		}

		crossCheckCriteriaDialogOpen = true;
	}

	async function compareDatasets(
		regafi: NormalizedEntity[],
		eba: NormalizedEntity[],
		options: ComparisonOptions
	): Promise<ComparisonResult> {
		const response = await fetch('/api/compare', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ regafi, eba, options })
		});

		const data = await response.json();
		if (!data.success) {
			throw new Error(data.error || 'Erreur de comparaison');
		}

		return data as ComparisonResult;
	}

	async function runFilteredComparison() {
		if (!ebaDatasetId || !regafiDatasetId) {
			error = 'Veuillez charger les données EBA et REGAFI avant de comparer.';
			return;
		}

		const columns: ComparisonOptions['columns'] = [];
		if (compareOnSiren) columns.push('siren');
		if (compareOnName) columns.push('denomination');

		if (columns.length === 0) {
			error = 'Sélectionnez au moins une colonne de comparaison.';
			return;
		}

		compareLoading = true;
		error = null;

		try {
			const [ebaFiltered, regafiFiltered] = await Promise.all([
				fetchEntities('eba', true),
				fetchEntities('regafi', true)
			]);

			const data = await compareDatasets(regafiFiltered, ebaFiltered, {
				columns,
				nameSimilarityThreshold: nameSimilarityPercent / 100
			});

			comparisonMatches = data.matches ?? [];
			ebaComparisonEntities = sortEntities(
				comparisonMatches
					.filter((match) => match.status !== 'match' && match.eba)
					.map((match) => match.eba as NormalizedEntity),
				ebaSortKey,
				ebaSortDir
			);
			regafiComparisonEntities = sortEntities(
				comparisonMatches
					.filter((match) => match.status !== 'match' && match.regafi)
					.map((match) => match.regafi as NormalizedEntity),
				regafiSortKey,
				regafiSortDir
			);

			ebaPage = 1;
			regafiPage = 1;
			compareLastSummary = `${data.summary?.totalMatches ?? 0} sociétés identiques, ${regafiComparisonEntities.length} REGAFI et ${ebaComparisonEntities.length} EBA à investiguer.`;
		} catch (runError) {
			clearComparisonMode();
			error = runError instanceof Error ? runError.message : 'Erreur de comparaison inconnue';
		} finally {
			compareLoading = false;
		}
	}

	async function runCrossCheckAgainstFullLists() {
		if (!compareModeActive || comparisonMatches.length === 0) {
			error = 'Lancez d\'abord une comparaison filtrée.';
			return;
		}

		const columns: ComparisonOptions['columns'] = [];
		if (compareOnSiren) columns.push('siren');
		if (compareOnName) columns.push('denomination');

		if (columns.length === 0) {
			error = 'Sélectionnez au moins une colonne de comparaison.';
			return;
		}

		const onlyInEba = comparisonMatches
			.filter((match) => match.status === 'onlyInEba' && match.eba)
			.map((match) => match.eba as NormalizedEntity);
		const onlyInRegafi = comparisonMatches
			.filter((match) => match.status === 'onlyInRegafi' && match.regafi)
			.map((match) => match.regafi as NormalizedEntity);

		if (onlyInEba.length === 0 && onlyInRegafi.length === 0) {
			crossCheckRows = [];
			crossCheckSummary = 'Aucune société uniquement présente dans une table à re-vérifier.';
			crossCheckProgress = null;
			crossCheckDialogOpen = true;
			return;
		}

		crossCheckLoading = true;
		crossCheckDialogOpen = true;
		crossCheckCriteriaDialogOpen = false;
		crossCheckRows = [];
		crossCheckSummary = null;
		crossCheckProgress = 'Préparation de la re-vérification...';
		error = null;

		try {
			const countryFilter = crossCheckCriteria.country.trim();
			const textFilter = countryFilter ? { pays: countryFilter } : {};
			const [fullRegafi, fullEba] = await Promise.all([
				fetchEntities('regafi', false, textFilter, {}, (page, totalPages) => {
					crossCheckProgress = `Chargement REGAFI (${countryFilter || 'sans filtre pays'}): page ${page}/${totalPages}`;
				}),
				fetchEntities('eba', false, textFilter, {}, (page, totalPages) => {
					crossCheckProgress = `Chargement EBA (${countryFilter || 'sans filtre pays'}): page ${page}/${totalPages}`;
				})
			]);

			crossCheckProgress = 'Recherche des sociétés correspondantes dans les listes complètes...';

			const [ebaCheck, regafiCheck] = await Promise.all([
				onlyInEba.length > 0
					? compareDatasets(fullRegafi, onlyInEba, {
						columns,
						nameSimilarityThreshold: nameSimilarityPercent / 100
					})
					: Promise.resolve({ matches: [], summary: {
						totalMatches: 0,
						totalNameMismatches: 0,
						totalCityMismatches: 0,
						totalCategoryMismatches: 0,
						totalOnlyInRegafi: 0,
						totalOnlyInEba: 0,
						totalRegafi: 0,
						totalEba: 0
					} } as ComparisonResult),
				onlyInRegafi.length > 0
					? compareDatasets(onlyInRegafi, fullEba, {
						columns,
						nameSimilarityThreshold: nameSimilarityPercent / 100
					})
					: Promise.resolve({ matches: [], summary: {
						totalMatches: 0,
						totalNameMismatches: 0,
						totalCityMismatches: 0,
						totalCategoryMismatches: 0,
						totalOnlyInRegafi: 0,
						totalOnlyInEba: 0,
						totalRegafi: 0,
						totalEba: 0
					} } as ComparisonResult)
			]);

			const foundFromEba = ebaCheck.matches
				.filter((match) => match.eba && match.status !== 'onlyInEba')
				.map((match) => ({
					origin: 'onlyInEba' as const,
					status: match.status,
					siren: match.siren,
					sourceName: match.eba?.denomination || '-',
					oppositeName: match.regafi?.denomination || '-',
					sourceCity: match.eba?.ville || '-',
					oppositeCity: match.regafi?.ville || '-'
				}));

			const foundFromRegafi = regafiCheck.matches
				.filter((match) => match.regafi && match.status !== 'onlyInRegafi')
				.map((match) => ({
					origin: 'onlyInRegafi' as const,
					status: match.status,
					siren: match.siren,
					sourceName: match.regafi?.denomination || '-',
					oppositeName: match.eba?.denomination || '-',
					sourceCity: match.regafi?.ville || '-',
					oppositeCity: match.eba?.ville || '-'
				}));

			crossCheckRows = [...foundFromEba, ...foundFromRegafi].sort((left, right) =>
				left.siren.localeCompare(right.siren, 'fr', { sensitivity: 'base' })
			);
			crossCheckSummary = `${crossCheckRows.length} société(s) retrouvée(s) dans les listes complètes opposées.`;
			crossCheckProgress = null;
			crossCheckDialogOpen = true;
		} catch (runError) {
			crossCheckProgress = null;
			error = runError instanceof Error ? runError.message : 'Erreur de re-vérification inconnue';
		} finally {
			crossCheckLoading = false;
		}
	}

	function toggleFilterDropdown(kind: 'eba' | 'regafi', key: DatasetColumnKey) {
		if (kind === 'eba') {
			ebaOpenFilter = ebaOpenFilter === key ? null : key;
			return;
		}

		regafiOpenFilter = regafiOpenFilter === key ? null : key;
	}

	function closeFilterDropdown(kind: 'eba' | 'regafi') {
		if (kind === 'eba') {
			ebaOpenFilter = null;
			return;
		}

		regafiOpenFilter = null;
	}

	onMount(() => {
		const handleDocumentClick = (event: MouseEvent) => {
			if (ebaOpenFilter && !isClickInsideActiveFilter(event.target, 'eba', ebaOpenFilter)) {
				closeFilterDropdown('eba');
			}

			if (regafiOpenFilter && !isClickInsideActiveFilter(event.target, 'regafi', regafiOpenFilter)) {
				closeFilterDropdown('regafi');
			}
		};

		document.addEventListener('click', handleDocumentClick);
		return () => document.removeEventListener('click', handleDocumentClick);
	});

	async function loadEbaPage() {
		if (!ebaDatasetId) return;
		clearComparisonMode();
		ebaLoading = true;
		const progressRequestId = beginEbaLoadingProgress('Chargement de la page EBA en cours...');
		try {
			const params = new URLSearchParams({
				datasetId: ebaDatasetId,
				progressRequestId,
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
			endEbaLoadingProgress();
		}
	}

	async function loadRegafiPage() {
		if (!regafiDatasetId) return;
		clearComparisonMode();
		regafiLoading = true;
		const progressRequestId = beginRegafiLoadingProgress('Chargement de la page REGAFI en cours...');
		try {
			const params = new URLSearchParams({
				datasetId: regafiDatasetId,
				progressRequestId,
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
			endRegafiLoadingProgress();
		}
	}

	async function onEbaLoaded(payload: { datasetId: string; count: number; sortKey: 'siren' }) {
		clearComparisonMode();
		ebaDatasetId = payload.datasetId;
		ebaCount = payload.count;
		ebaSortKey = payload.sortKey;
		error = null;
		ebaPage = 1;
		await loadEbaPage();
	}

	async function onRegafiLoaded(payload: { datasetId: string; count: number; sortKey: 'siren' }) {
		clearComparisonMode();
		regafiDatasetId = payload.datasetId;
		regafiCount = payload.count;
		regafiSortKey = payload.sortKey;
		error = null;
		regafiPage = 1;
		await loadRegafiPage();
	}

	function resetAll() {
		clearComparisonMode();
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
		ebaSelectFilters = { ...createSelectFilters(EBA_COLUMNS), rolesCountry: [], rolesName: [] };
		regafiSelectFilters = { ...createSelectFilters(REGAFI_COLUMNS), rolesCountry: [], rolesName: [] };
		ebaFilterOptions = {};
		regafiFilterOptions = {};
	}

	const ebaTotalPages = $derived(Math.max(1, Math.ceil(displayEbaCount / PAGE_SIZE)));
	const regafiTotalPages = $derived(Math.max(1, Math.ceil(displayRegafiCount / PAGE_SIZE)));
	let ebaProgressPollToken = 0;

	onMount(() => {
		if (!ebaDatasetId) void loadLatestEba();
		if (!regafiDatasetId) void loadLatestRegafi();
	});

	async function pollEbaLoadingProgress(requestId: string, token: number) {
		while (ebaProgressPollToken === token) {
			try {
				const res = await fetch(`/api/eba?progressOnly=1&progressRequestId=${encodeURIComponent(requestId)}`);
				const data = await res.json();
				const progress = data.progress as
					| { message: string; percent: number; status: 'running' | 'done' | 'error' }
					| null;

				if (progress) {
					ebaLoadingMessage = progress.message;
					ebaLoadingPercent = progress.percent;
					if (progress.status !== 'running') {
						return;
					}
				}
			} catch {
				return;
			}

			await new Promise((resolve) => setTimeout(resolve, 350));
		}
	}

	function beginEbaLoadingProgress(initialMessage: string): string {
		const requestId = crypto.randomUUID();
		ebaProgressPollToken += 1;
		const token = ebaProgressPollToken;
		ebaLoadingMessage = initialMessage;
		ebaLoadingPercent = 2;
		void pollEbaLoadingProgress(requestId, token);
		return requestId;
	}

	function endEbaLoadingProgress() {
		ebaProgressPollToken += 1;
		ebaLoadingMessage = null;
		ebaLoadingPercent = null;
	}

	let regafiProgressPollToken = 0;

	async function pollRegafiLoadingProgress(requestId: string, token: number) {
		while (regafiProgressPollToken === token) {
			try {
				const res = await fetch(`/api/regafi?progressOnly=1&progressRequestId=${encodeURIComponent(requestId)}`);
				const data = await res.json();
				const progress = data.progress as
					| { message: string; percent: number; status: 'running' | 'done' | 'error' }
					| null;

				if (progress) {
					regafiLoadingMessage = progress.message;
					regafiLoadingPercent = progress.percent;
					if (progress.status !== 'running') {
						return;
					}
				}
			} catch {
				return;
			}

			await new Promise((resolve) => setTimeout(resolve, 350));
		}
	}

	function beginRegafiLoadingProgress(initialMessage: string): string {
		const requestId = crypto.randomUUID();
		regafiProgressPollToken += 1;
		const token = regafiProgressPollToken;
		regafiLoadingMessage = initialMessage;
		regafiLoadingPercent = 2;
		void pollRegafiLoadingProgress(requestId, token);
		return requestId;
	}

	function endRegafiLoadingProgress() {
		regafiProgressPollToken += 1;
		regafiLoadingMessage = null;
		regafiLoadingPercent = null;
	}

	async function loadLatestEba() {
		clearComparisonMode();
		ebaLoading = true;
		const progressRequestId = beginEbaLoadingProgress('Demande de chargement EBA envoyée au serveur...');
		try {
			const params = new URLSearchParams({
				latest: '1',
				progressRequestId,
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
			endEbaLoadingProgress();
		}
	}

	async function loadLatestRegafi() {
		clearComparisonMode();
		regafiLoading = true;
		const progressRequestId = beginRegafiLoadingProgress('Demande de chargement REGAFI envoyée au serveur...');
		try {
			const params = new URLSearchParams({
				latest: '1',
				progressRequestId,
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
			endRegafiLoadingProgress();
		}
	}

	function onEbaSortClick(columnKey: DatasetColumnKey, direction: SortDirection) {
		ebaSortKey = columnKey;
		ebaSortDir = direction;
		ebaPage = 1;
		if (compareModeActive) {
			ebaComparisonEntities = sortEntities(ebaComparisonEntities, ebaSortKey, ebaSortDir);
			return;
		}
		void loadEbaPage();
	}

	function onRegafiSortClick(columnKey: DatasetColumnKey, direction: SortDirection) {
		regafiSortKey = columnKey;
		regafiSortDir = direction;
		regafiPage = 1;
		if (compareModeActive) {
			regafiComparisonEntities = sortEntities(regafiComparisonEntities, regafiSortKey, regafiSortDir);
			return;
		}
		void loadRegafiPage();
	}

	function onEbaTextFilterChange(key: DatasetColumnKey, value: string) {
		clearComparisonMode();
		ebaTextFilters = { ...ebaTextFilters, [key]: value };
		ebaPage = 1;
		void loadEbaPage();
	}

	function onRegafiTextFilterChange(key: DatasetColumnKey, value: string) {
		clearComparisonMode();
		regafiTextFilters = { ...regafiTextFilters, [key]: value };
		regafiPage = 1;
		void loadRegafiPage();
	}

	function onEbaSelectFilterToggle(key: DatasetColumnKey, value: string) {
		clearComparisonMode();
		const current = ebaSelectFilters[key] ?? [];
		const next = toggleSelectValue(current, value);
		ebaSelectFilters = { ...ebaSelectFilters, [key]: next };
		ebaPage = 1;
		void loadEbaPage();
	}

	function onRegafiSelectFilterToggle(key: DatasetColumnKey, value: string) {
		clearComparisonMode();
		const current = regafiSelectFilters[key] ?? [];
		const next = toggleSelectValue(current, value);
		regafiSelectFilters = { ...regafiSelectFilters, [key]: next };
		regafiPage = 1;
		void loadRegafiPage();
	}

	function onEbaSelectFilterClear(key: DatasetColumnKey) {
		clearComparisonMode();
		ebaSelectFilters = { ...ebaSelectFilters, [key]: [] };
		ebaPage = 1;
		void loadEbaPage();
	}

	function onRegafiSelectFilterClear(key: DatasetColumnKey) {
		clearComparisonMode();
		regafiSelectFilters = { ...regafiSelectFilters, [key]: [] };
		regafiPage = 1;
		void loadRegafiPage();
	}

	function onEbaSelectFilterAll(key: DatasetColumnKey, column: TableColumn) {
		clearComparisonMode();
		ebaSelectFilters = { ...ebaSelectFilters, [key]: setAllSelectValues(column, ebaFilterOptions) };
		ebaPage = 1;
		void loadEbaPage();
	}

	function onRegafiSelectFilterAll(key: DatasetColumnKey, column: TableColumn) {
		clearComparisonMode();
		regafiSelectFilters = { ...regafiSelectFilters, [key]: setAllSelectValues(column, regafiFilterOptions) };
		regafiPage = 1;
		void loadRegafiPage();
	}

	function onEbaRoleSelectFilterToggle(key: 'rolesCountry' | 'rolesName', value: string) {
		clearComparisonMode();
		const current = ebaSelectFilters[key] ?? [];
		const next = toggleSelectValue(current, value);
		ebaSelectFilters = { ...ebaSelectFilters, [key]: next };
		ebaPage = 1;
		void loadEbaPage();
	}

	function onRegafiRoleSelectFilterToggle(key: 'rolesCountry' | 'rolesName', value: string) {
		clearComparisonMode();
		const current = regafiSelectFilters[key] ?? [];
		const next = toggleSelectValue(current, value);
		regafiSelectFilters = { ...regafiSelectFilters, [key]: next };
		regafiPage = 1;
		void loadRegafiPage();
	}

	function onEbaRoleSelectFilterClear(key: 'rolesCountry' | 'rolesName') {
		clearComparisonMode();
		ebaSelectFilters = { ...ebaSelectFilters, [key]: [] };
		ebaPage = 1;
		void loadEbaPage();
	}

	function onRegafiRoleSelectFilterClear(key: 'rolesCountry' | 'rolesName') {
		clearComparisonMode();
		regafiSelectFilters = { ...regafiSelectFilters, [key]: [] };
		regafiPage = 1;
		void loadRegafiPage();
	}

	function onEbaRoleSelectFilterAll(key: 'rolesCountry' | 'rolesName') {
		clearComparisonMode();
		const source = ebaFilterOptions[key] ?? [];
		ebaSelectFilters = { ...ebaSelectFilters, [key]: getRoleSelectableValues(source) };
		ebaPage = 1;
		void loadEbaPage();
	}

	function onRegafiRoleSelectFilterAll(key: 'rolesCountry' | 'rolesName') {
		clearComparisonMode();
		const source = regafiFilterOptions[key] ?? [];
		regafiSelectFilters = { ...regafiSelectFilters, [key]: getRoleSelectableValues(source) };
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
		<section class="bg-white rounded-lg border border-gray-200 p-4">
			<div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
				<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
					<label class="inline-flex items-center gap-2 text-sm text-gray-700">
						<input type="checkbox" class="h-4 w-4" bind:checked={compareOnSiren} />
						<span>Comparer le SIREN</span>
					</label>
					<label class="inline-flex items-center gap-2 text-sm text-gray-700">
						<input type="checkbox" class="h-4 w-4" bind:checked={compareOnName} />
						<span>Comparer la dénomination</span>
					</label>
					<label class="flex items-center gap-2 text-sm text-gray-700">
						<span>Seuil nom (%)</span>
						<input
							type="number"
							min="0"
							max="100"
							class="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
							value={nameSimilarityPercent}
							oninput={(event) => clampNameSimilarity((event.currentTarget as HTMLInputElement).value)}
						/>
					</label>
				</div>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
						onclick={runFilteredComparison}
						disabled={compareLoading || !ebaDatasetId || !regafiDatasetId}
					>
						{compareLoading ? 'Comparaison en cours...' : 'Comparer les filtres actifs'}
					</button>
					<button
						type="button"
						class="rounded border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40"
						onclick={openCrossCheckCriteriaDialog}
						disabled={crossCheckLoading || !compareModeActive}
					>
						{crossCheckLoading ? 'Recherche...' : 'Rechercher dans les listes complètes'}
					</button>
					{#if compareModeActive}
						<button
							type="button"
							class="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
							onclick={clearComparisonMode}
						>
							Retour aux tables filtrées
						</button>
					{/if}
				</div>
			</div>
			{#if compareLastSummary}
				<p class="mt-3 text-sm text-gray-600">{compareLastSummary}</p>
			{/if}
			{#if compareModeActive}
				<p class="mt-1 text-xs text-gray-500">Mode comparaison: seules les sociétés non identiques entre les filtres EBA/REGAFI sont affichées.</p>
			{/if}
			{#if crossCheckSummary}
				<p class="mt-1 text-xs text-blue-700">{crossCheckSummary}</p>
			{/if}
		</section>

		<section class="bg-white rounded-lg border border-gray-200 p-6">
			<div class="border border-gray-200 rounded-lg overflow-hidden">
				<div class="relative bg-blue-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-4">
					<h3 class="text-base font-semibold text-blue-800">EBA ({displayEbaCount})</h3>
					{#if ebaLoading}
						<div class="pointer-events-none absolute left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4">
							<div class="rounded-lg border border-blue-200 bg-white/90 px-3 py-2 shadow-sm">
								<div class="flex items-center gap-3 text-sm text-blue-900">
									<div class="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600"></div>
									<div class="flex-1">
										<p>{ebaLoadingMessage || 'Chargement des données EBA...'}</p>
										<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100">
											<div class="h-full rounded-full bg-blue-600 transition-[width] duration-200" style={`width: ${Math.max(ebaLoadingPercent ?? 6, 6)}%`}></div>
										</div>
									</div>
									<span class="text-xs text-blue-700">{ebaLoadingPercent ?? 0}%</span>
								</div>
							</div>
						</div>
					{/if}
					<div class="flex items-center gap-2">
						<button
							type="button"
							class="rounded border border-blue-300 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40"
							onclick={() => void exportDatasetTableToCsv('eba')}
							disabled={ebaExportLoading || !ebaDatasetId}
						>
							{ebaExportLoading ? 'Export...' : 'Exporter les filtres'}
						</button>
						<EbaUpload onLoaded={onEbaLoaded} />
					</div>
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
															{#if column.key === 'rolesSummary'}
																<div class="space-y-1">
																	<div class="relative" data-filter-kind="eba" data-filter-key="rolesCountry">
																		<button
																			type="button"
																			class="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-left hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
																			onclick={() => toggleFilterDropdown('eba', 'rolesCountry')}
																		>
																			Pays du role: {getFilterButtonLabel(ebaSelectFilters, 'rolesCountry')}
																		</button>
																		{#if ebaOpenFilter === 'rolesCountry'}
																			<div class="absolute left-0 mt-1 w-72 max-h-60 overflow-auto rounded border border-gray-200 bg-white p-2 shadow-lg z-30">
																				<div class="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-2 text-xs">
																					<button type="button" class="rounded px-2 py-1 hover:bg-gray-100" onclick={() => onEbaRoleSelectFilterAll('rolesCountry')}>
																						Tout cocher
																					</button>
																					<button type="button" class="rounded px-2 py-1 hover:bg-gray-100" onclick={() => onEbaRoleSelectFilterClear('rolesCountry')}>
																						Tout decocher
																					</button>
																					<button type="button" class="rounded px-2 py-1 hover:bg-gray-100 text-red-600" onclick={() => onEbaRoleSelectFilterClear('rolesCountry')}>
																						Effacer
																					</button>
																				</div>
																				{#each getRoleSelectOptions(ebaFilterOptions.rolesCountry ?? []) as option}
																					<label class="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-gray-50 cursor-pointer">
																						<input
																							type="checkbox"
																							class="h-3.5 w-3.5"
																							checked={isSelectValueChecked(ebaSelectFilters, 'rolesCountry', option.value)}
																							onchange={() => onEbaRoleSelectFilterToggle('rolesCountry', option.value)}
																						/>
																						<span class="truncate">{option.label}</span>
																					</label>
																				{/each}
																			</div>
																		{/if}
																	</div>
																	<div class="relative" data-filter-kind="eba" data-filter-key="rolesName">
																		<button
																			type="button"
																			class="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-left hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
																			onclick={() => toggleFilterDropdown('eba', 'rolesName')}
																		>
																			Role PSD2: {getFilterButtonLabel(ebaSelectFilters, 'rolesName')}
																		</button>
																		{#if ebaOpenFilter === 'rolesName'}
																			<div class="absolute left-0 mt-1 w-72 max-h-60 overflow-auto rounded border border-gray-200 bg-white p-2 shadow-lg z-30">
																				<div class="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-2 text-xs">
																					<button type="button" class="rounded px-2 py-1 hover:bg-gray-100" onclick={() => onEbaRoleSelectFilterAll('rolesName')}>
																						Tout cocher
																					</button>
																					<button type="button" class="rounded px-2 py-1 hover:bg-gray-100" onclick={() => onEbaRoleSelectFilterClear('rolesName')}>
																						Tout decocher
																					</button>
																					<button type="button" class="rounded px-2 py-1 hover:bg-gray-100 text-red-600" onclick={() => onEbaRoleSelectFilterClear('rolesName')}>
																						Effacer
																					</button>
																				</div>
																				{#each getRoleSelectOptions(ebaFilterOptions.rolesName ?? []) as option}
																					<label class="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-gray-50 cursor-pointer">
																						<input
																							type="checkbox"
																							class="h-3.5 w-3.5"
																							checked={isSelectValueChecked(ebaSelectFilters, 'rolesName', option.value)}
																							onchange={() => onEbaRoleSelectFilterToggle('rolesName', option.value)}
																						/>
																						<span class="truncate">{option.label}</span>
																					</label>
																				{/each}
																			</div>
																		{/if}
																	</div>
																</div>
															{:else if column.filterType !== 'none'}
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
														<div class="relative" data-filter-kind="eba" data-filter-key={column.key}>
															<button
																type="button"
																class="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-left hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
																onclick={() => toggleFilterDropdown('eba', column.key)}
															>
																{getFilterButtonLabel(ebaSelectFilters, column.key)}
															</button>
															{#if ebaOpenFilter === column.key}
																<div class="absolute left-0 mt-1 w-72 max-h-60 overflow-auto rounded border border-gray-200 bg-white p-2 shadow-lg z-30">
																	<div class="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-2 text-xs">
																		<button type="button" class="rounded px-2 py-1 hover:bg-gray-100" onclick={() => onEbaSelectFilterAll(column.key, column)}>
																			Tout cocher
																		</button>
																		<button type="button" class="rounded px-2 py-1 hover:bg-gray-100" onclick={() => onEbaSelectFilterClear(column.key)}>
																			Tout décocher
																		</button>
																		<button type="button" class="rounded px-2 py-1 hover:bg-gray-100 text-red-600" onclick={() => onEbaSelectFilterClear(column.key)}>
																			Effacer
																		</button>
																	</div>
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
															{/if}
														</div>
													{/if}
												</div>
											{/if}
										</th>
									{/each}
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each displayEbaItems as entity}
									<tr class="hover:bg-gray-50">
										{#each EBA_COLUMNS as column}
											<td class={`px-4 py-3 ${column.widthClass || ''} ${column.cellClass || ''}`}>
												{getColumnValue(entity, column.key)}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
						<button class="disabled:opacity-30" disabled={ebaPage <= 1} onclick={() => { ebaPage = Math.max(1, ebaPage - 1); if (!compareModeActive) void loadEbaPage(); }}>
							← Préc.
						</button>
						<span>Page {ebaPage} / {ebaTotalPages}</span>
						<button class="disabled:opacity-30" disabled={ebaPage >= ebaTotalPages} onclick={() => { ebaPage = Math.min(ebaTotalPages, ebaPage + 1); if (!compareModeActive) void loadEbaPage(); }}>
							Suiv. →
						</button>
					</div>
				{/if}
			</div>
		</section>

		<section class="bg-white rounded-lg border border-gray-200 p-6">
			<div class="border border-gray-200 rounded-lg overflow-hidden">
				<div class="relative bg-red-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-4">
					<h3 class="text-base font-semibold text-red-800">REGAFI ({displayRegafiCount})</h3>
					{#if regafiLoading}
						<div class="pointer-events-none absolute left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4">
							<div class="rounded-lg border border-red-200 bg-white/90 px-3 py-2 shadow-sm">
								<div class="flex items-center gap-3 text-sm text-red-900">
									<div class="h-4 w-4 animate-spin rounded-full border-2 border-red-200 border-t-red-600"></div>
									<div class="flex-1">
										<p>{regafiLoadingMessage || 'Chargement des données REGAFI...'}</p>
										<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-red-100">
											<div class="h-full rounded-full bg-red-600 transition-[width] duration-200" style={`width: ${Math.max(regafiLoadingPercent ?? 6, 6)}%`}></div>
										</div>
									</div>
									<span class="text-xs text-red-700">{regafiLoadingPercent ?? 0}%</span>
								</div>
							</div>
						</div>
					{/if}
					<div class="flex items-center gap-2">
						<button
							type="button"
							class="rounded border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-40"
							onclick={() => void exportDatasetTableToCsv('regafi')}
							disabled={regafiExportLoading || !regafiDatasetId}
						>
							{regafiExportLoading ? 'Export...' : 'Exporter les filtres'}
						</button>
						<RegafiUpload onLoaded={onRegafiLoaded} />
					</div>
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
											{#if column.key === 'rolesSummary'}
												<div class="space-y-1">
													<div class="relative" data-filter-kind="regafi" data-filter-key="rolesCountry">
														<button
															type="button"
															class="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-left hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-red-500"
															onclick={() => toggleFilterDropdown('regafi', 'rolesCountry')}
														>
															Pays du role: {getFilterButtonLabel(regafiSelectFilters, 'rolesCountry')}
														</button>
														{#if regafiOpenFilter === 'rolesCountry'}
															<div class="absolute left-0 mt-1 w-72 max-h-60 overflow-auto rounded border border-gray-200 bg-white p-2 shadow-lg z-30">
																<div class="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-2 text-xs">
																	<button type="button" class="rounded px-2 py-1 hover:bg-gray-100" onclick={() => onRegafiRoleSelectFilterAll('rolesCountry')}>
																		Tout cocher
																	</button>
																	<button type="button" class="rounded px-2 py-1 hover:bg-gray-100" onclick={() => onRegafiRoleSelectFilterClear('rolesCountry')}>
																		Tout decocher
																	</button>
																	<button type="button" class="rounded px-2 py-1 hover:bg-gray-100 text-red-600" onclick={() => onRegafiRoleSelectFilterClear('rolesCountry')}>
																		Effacer
																	</button>
																</div>
																{#each getRoleSelectOptions(regafiFilterOptions.rolesCountry ?? []) as option}
																	<label class="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-gray-50 cursor-pointer">
																		<input
																			type="checkbox"
																			class="h-3.5 w-3.5"
																			checked={isSelectValueChecked(regafiSelectFilters, 'rolesCountry', option.value)}
																			onchange={() => onRegafiRoleSelectFilterToggle('rolesCountry', option.value)}
																		/>
																		<span class="truncate">{option.label}</span>
																	</label>
																{/each}
															</div>
														{/if}
													</div>
													<div class="relative" data-filter-kind="regafi" data-filter-key="rolesName">
														<button
															type="button"
															class="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-left hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-red-500"
															onclick={() => toggleFilterDropdown('regafi', 'rolesName')}
														>
															Role PSD2: {getFilterButtonLabel(regafiSelectFilters, 'rolesName')}
														</button>
														{#if regafiOpenFilter === 'rolesName'}
															<div class="absolute left-0 mt-1 w-72 max-h-60 overflow-auto rounded border border-gray-200 bg-white p-2 shadow-lg z-30">
																<div class="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-2 text-xs">
																	<button type="button" class="rounded px-2 py-1 hover:bg-gray-100" onclick={() => onRegafiRoleSelectFilterAll('rolesName')}>
																		Tout cocher
																	</button>
																	<button type="button" class="rounded px-2 py-1 hover:bg-gray-100" onclick={() => onRegafiRoleSelectFilterClear('rolesName')}>
																		Tout decocher
																	</button>
																	<button type="button" class="rounded px-2 py-1 hover:bg-gray-100 text-red-600" onclick={() => onRegafiRoleSelectFilterClear('rolesName')}>
																		Effacer
																	</button>
																</div>
																{#each getRoleSelectOptions(regafiFilterOptions.rolesName ?? []) as option}
																	<label class="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-gray-50 cursor-pointer">
																		<input
																			type="checkbox"
																			class="h-3.5 w-3.5"
																			checked={isSelectValueChecked(regafiSelectFilters, 'rolesName', option.value)}
																			onchange={() => onRegafiRoleSelectFilterToggle('rolesName', option.value)}
																		/>
																		<span class="truncate">{option.label}</span>
																	</label>
																{/each}
															</div>
														{/if}
													</div>
												</div>
											{:else if column.filterType !== 'none'}
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
														<div class="relative" data-filter-kind="regafi" data-filter-key={column.key}>
															<button
																type="button"
																class="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-left hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-red-500"
																onclick={() => toggleFilterDropdown('regafi', column.key)}
															>
																{getFilterButtonLabel(regafiSelectFilters, column.key)}
															</button>
															{#if regafiOpenFilter === column.key}
																<div class="absolute left-0 mt-1 w-72 max-h-60 overflow-auto rounded border border-gray-200 bg-white p-2 shadow-lg z-30">
																	<div class="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-2 text-xs">
																		<button type="button" class="rounded px-2 py-1 hover:bg-gray-100" onclick={() => onRegafiSelectFilterAll(column.key, column)}>
																			Tout cocher
																		</button>
																		<button type="button" class="rounded px-2 py-1 hover:bg-gray-100" onclick={() => onRegafiSelectFilterClear(column.key)}>
																			Tout décocher
																		</button>
																		<button type="button" class="rounded px-2 py-1 hover:bg-gray-100 text-red-600" onclick={() => onRegafiSelectFilterClear(column.key)}>
																			Effacer
																		</button>
																	</div>
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
															{/if}
														</div>
													{/if}
												</div>
											{/if}
										</th>
									{/each}
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each displayRegafiItems as entity}
									<tr class="hover:bg-gray-50">
										{#each REGAFI_COLUMNS as column}
											<td class={`px-4 py-3 ${column.widthClass || ''} ${column.cellClass || ''}`}>
												{getColumnValue(entity, column.key)}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
						<button class="disabled:opacity-30" disabled={regafiPage <= 1} onclick={() => { regafiPage = Math.max(1, regafiPage - 1); if (!compareModeActive) void loadRegafiPage(); }}>
							← Préc.
						</button>
						<span>Page {regafiPage} / {regafiTotalPages}</span>
						<button class="disabled:opacity-30" disabled={regafiPage >= regafiTotalPages} onclick={() => { regafiPage = Math.min(regafiTotalPages, regafiPage + 1); if (!compareModeActive) void loadRegafiPage(); }}>
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

{#if crossCheckDialogOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="w-full max-w-6xl rounded-lg bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b border-gray-200 px-5 py-3">
				<div>
					<h3 class="text-lg font-semibold text-gray-900">Sociétés retrouvées dans la liste complète opposée</h3>
					<p class="text-xs text-gray-500">Résultats de re-vérification des sociétés initialement marquées comme uniques.</p>
				</div>
				<button
					type="button"
					class="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
					onclick={() => { crossCheckDialogOpen = false; }}
				>
					Fermer
				</button>
			</div>

			<div class="max-h-[70vh] overflow-auto px-5 py-4">
				{#if crossCheckLoading}
					<div class="py-10 text-center">
						<div class="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
						<p class="text-sm text-gray-700">Recherche en cours...</p>
						{#if crossCheckProgress}
							<p class="mt-1 text-xs text-gray-500">{crossCheckProgress}</p>
						{/if}
					</div>
				{:else if crossCheckRows.length === 0}
					<p class="py-8 text-center text-sm text-gray-500">Aucune société n'a été retrouvée dans la liste complète opposée.</p>
				{:else}
					<table class="w-full table-fixed text-sm">
						<thead class="sticky top-0 bg-gray-50">
							<tr>
								<th class="px-3 py-2 text-left font-medium text-gray-500">Origine</th>
								<th class="px-3 py-2 text-left font-medium text-gray-500">Statut</th>
								<th class="px-3 py-2 text-left font-medium text-gray-500">SIREN</th>
								<th class="px-3 py-2 text-left font-medium text-gray-500">Société initiale</th>
								<th class="px-3 py-2 text-left font-medium text-gray-500">Trouvée dans liste complète</th>
								<th class="px-3 py-2 text-left font-medium text-gray-500">Ville initiale</th>
								<th class="px-3 py-2 text-left font-medium text-gray-500">Ville opposée</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100">
							{#each crossCheckRows as row}
								<tr class="hover:bg-gray-50">
									<td class="px-3 py-2 text-xs text-gray-600">{row.origin === 'onlyInEba' ? 'Uniquement EBA' : 'Uniquement REGAFI'}</td>
									<td class="px-3 py-2">
										<span class={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClass(row.status)}`}>
											{getStatusLabel(row.status)}
										</span>
									</td>
									<td class="px-3 py-2 font-mono text-xs">{row.siren || '-'}</td>
									<td class="px-3 py-2">{row.sourceName}</td>
									<td class="px-3 py-2">{row.oppositeName}</td>
									<td class="px-3 py-2">{row.sourceCity}</td>
									<td class="px-3 py-2">{row.oppositeCity}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if crossCheckCriteriaDialogOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
		<div class="w-full max-w-lg rounded-lg bg-white p-5 shadow-2xl">
			<h3 class="text-lg font-semibold text-gray-900">Filtrer la recherche dans les listes complètes</h3>
			<p class="mt-1 text-sm text-gray-600">Réduisez le périmètre pour accélérer la recherche des sociétés opposées.</p>

			<div class="mt-4 space-y-3">
				<label class="block text-sm text-gray-700">
					<span class="mb-1 block font-medium">Pays (opposé)</span>
					<input
						type="text"
						class="w-full rounded border border-gray-300 px-3 py-2 text-sm"
						placeholder="Ex: France"
						bind:value={crossCheckCriteria.country}
					/>
				</label>
				<p class="text-xs text-gray-500">Laisser vide pour rechercher dans tous les pays.</p>
			</div>

			<div class="mt-5 flex items-center justify-end gap-2">
				<button
					type="button"
					class="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
					onclick={() => { crossCheckCriteriaDialogOpen = false; }}
				>
					Annuler
				</button>
				<button
					type="button"
					class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					onclick={runCrossCheckAgainstFullLists}
				>
					Lancer la recherche
				</button>
			</div>
		</div>
	</div>
{/if}