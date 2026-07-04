import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NormalizedEntity } from '$lib/types';

export type DatasetKind = 'eba' | 'regafi';
export type DatasetSortKey = 'siren' | 'denomination' | 'none';

const STORAGE_DIR = join(process.cwd(), '.data', 'uploads');

function getDatasetPath(kind: DatasetKind, datasetId: string): string {
	if (!datasetId.startsWith(`${kind}-`) || !/^[a-z]+-[0-9]+-[a-f0-9]+$/i.test(datasetId)) {
		throw new Error('Identifiant de dataset invalide');
	}

	return join(STORAGE_DIR, `${datasetId}.json`);
}

function getDatasetTimestamp(datasetId: string): number {
	const match = datasetId.match(/^[a-z]+-([0-9]+)-[a-f0-9]+$/i);
	return match ? Number(match[1]) : 0;
}

export async function persistDataset(
	kind: DatasetKind,
	entities: NormalizedEntity[]
): Promise<{ datasetId: string; count: number }> {
	await mkdir(STORAGE_DIR, { recursive: true });

	const datasetId = `${kind}-${Date.now()}-${randomUUID().slice(0, 8)}`;
	const filePath = getDatasetPath(kind, datasetId);

	await writeFile(filePath, JSON.stringify(entities), 'utf-8');

	return {
		datasetId,
		count: entities.length
	};
}

async function readDataset(kind: DatasetKind, datasetId: string): Promise<NormalizedEntity[]> {
	const filePath = getDatasetPath(kind, datasetId);
	const content = await readFile(filePath, 'utf-8');
	const parsed = JSON.parse(content);

	if (!Array.isArray(parsed)) {
		throw new Error('Dataset corrompu');
	}

	return parsed as NormalizedEntity[];
}

export async function getLatestDatasetId(kind: DatasetKind): Promise<string | null> {
	try {
		const files = await readdir(STORAGE_DIR);
		const latest = files
			.filter((file) => file.startsWith(`${kind}-`) && file.endsWith('.json'))
			.map((file) => file.replace(/\.json$/i, ''))
			.sort((a, b) => getDatasetTimestamp(b) - getDatasetTimestamp(a))[0];

		return latest || null;
	} catch {
		return null;
	}
}

export async function getDatasetPage(
	kind: DatasetKind,
	datasetId: string,
	params: {
		page: number;
		pageSize: number;
		search: string;
		sortKey: DatasetSortKey;
	}
): Promise<{
	items: NormalizedEntity[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}> {
	const entities = await readDataset(kind, datasetId);

	const query = params.search.trim().toLowerCase();
	let filtered = entities;

	if (query) {
		filtered = entities.filter(
			(entity) =>
				entity.siren.toLowerCase().includes(query) ||
				entity.denomination.toLowerCase().includes(query)
		);
	}

	const sorted =
		params.sortKey === 'none'
			? filtered
			: [...filtered].sort((a, b) => {
				const sortKey = params.sortKey === 'none' ? 'siren' : params.sortKey;
				return (a[sortKey] || '').localeCompare(b[sortKey] || '');
			});

	const total = sorted.length;
	const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
	const safePage = Math.min(Math.max(1, params.page), totalPages);
	const start = (safePage - 1) * params.pageSize;
	const items = sorted.slice(start, start + params.pageSize);

	return {
		items,
		total,
		page: safePage,
		pageSize: params.pageSize,
		totalPages
	};
}

export async function getLatestDatasetPage(
	kind: DatasetKind,
	params: {
		page: number;
		pageSize: number;
		search: string;
		sortKey: DatasetSortKey;
	}
): Promise<{
	datasetId: string | null;
	items: NormalizedEntity[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}> {
	const datasetId = await getLatestDatasetId(kind);

	if (!datasetId) {
		return {
			datasetId: null,
			items: [],
			total: 0,
			page: 1,
			pageSize: params.pageSize,
			totalPages: 1
		};
	}

	const page = await getDatasetPage(kind, datasetId, params);
	return { datasetId, ...page };
}