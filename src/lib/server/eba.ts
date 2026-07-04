import type { NormalizedEntity } from '$lib/types';
import { extractJsonObjects } from './stream-json';

function normalizePropertyValue(value: unknown): string {
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);

	if (Array.isArray(value)) {
		return value
			.map((item) => {
				if (typeof item === 'string') return item.trim();
				if (typeof item === 'number' || typeof item === 'boolean') return String(item);
				return '';
			})
			.filter(Boolean)
			.join(' ')
			.trim();
	}

	return '';
}

function extractProperties(raw: Record<string, unknown>): Record<string, string> {
	const props: Record<string, string> = {};

	if (!Array.isArray(raw.Properties)) return props;

	for (const item of raw.Properties) {
		if (!item || typeof item !== 'object') continue;

		// Shape 1: { PropertyCode: 'ENT_NAM', PropertyValue: '...' }
		const code = 'PropertyCode' in item ? item.PropertyCode : undefined;
		if (typeof code === 'string') {
			const value = normalizePropertyValue('PropertyValue' in item ? item.PropertyValue : undefined);
			if (value) props[code] = value;
			continue;
		}

		// Shape 2: { ENT_NAM: '...' } or { ENT_ADD: ['line1', 'line2'] }
		for (const [key, value] of Object.entries(item)) {
			const normalized = normalizePropertyValue(value);
			if (normalized) props[key] = normalized;
		}
	}

	return props;
}

function normalizeEbaEntity(raw: Record<string, unknown>): NormalizedEntity | null {
	if (raw.CA_OwnerID !== 'FR_ACPR') return null;

	const props = extractProperties(raw);

	const siren = props['ENT_NAT_REF_COD'] || '';
	// if (!siren) return null;

	return {
		siren,
		denomination: props['ENT_NAM'] || '',
		ville: props['ENT_TOW_CIT_RES'] || null,
		pays: 'FRANCE',
		categorie: mapEbaTypeToCategory(String(raw.EntityType || '')),
		lei: null,
		entityCode: raw.EntityCode ? String(raw.EntityCode) : undefined,
		source: 'eba'
	};
}

export function parseEbaPayload(payload: unknown): NormalizedEntity[] {
	const french: NormalizedEntity[] = [];
	const stack: unknown[] = [payload];

	while (stack.length > 0) {
		const current = stack.pop();

		if (Array.isArray(current)) {
			for (let i = current.length - 1; i >= 0; i--) {
				stack.push(current[i]);
			}
			continue;
		}

		if (!current || typeof current !== 'object') continue;

		const obj = current as Record<string, unknown>;
		const entity = normalizeEbaEntity(obj);
		if (entity) french.push(entity);

		for (const value of Object.values(obj)) {
			if (value && typeof value === 'object') {
				stack.push(value);
			}
		}
	}

	return french;
}

export async function parseEbaStream(webStream: ReadableStream): Promise<NormalizedEntity[]> {
	const french: NormalizedEntity[] = [];
	for await (const raw of extractJsonObjects(webStream)) {
		const entity = normalizeEbaEntity(raw);
		if (entity) french.push(entity);
 	}

	return french;
}

function mapEbaTypeToCategory(entityType: string): string {
	switch (entityType) {
		case 'PSD_PI':
			return 'Établissement de Paiement';
		case 'PSD_EMI':
			return 'Établissement de Monnaie Électronique';
		case 'PSD_AISP':
			return 'Prestataire de services d\'informations sur les comptes (PSIC)';
		case 'PSD_AGENT':
			return 'Agent PSP';
		case 'PSD_EXEMPTED_PI':
			return 'Autres prestataires de services de paiement';
		case 'PSD_EXEMPTED_EMI':
			return 'Établissement de Monnaie Électronique (exempté)';
		case 'PSD_EXCLUDED_PSP':
			return 'Prestataire exclu';
		case 'PSD_BRANCH':
			return 'Succursale';
		default:
			return entityType;
	}
}
