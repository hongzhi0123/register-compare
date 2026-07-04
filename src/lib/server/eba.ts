import type { NormalizedEntity } from '$lib/types';
import { extractJsonObjects } from './stream-json';

function normalizeEbaEntity(raw: Record<string, unknown>): NormalizedEntity | null {
	if (raw.CA_OwnerID !== 'FR_ACPR') return null;

	const props: Record<string, string> = {};
	if (Array.isArray(raw.Properties)) {
		for (const item of raw.Properties) {
			if (item && typeof item.PropertyCode === 'string' && typeof item.PropertyValue === 'string') {
				props[item.PropertyCode] = item.PropertyValue;
			}
		}
	}

	const siren = props['ENT_NAT_REF_COD'] || '';
	// if (!siren) return null;

	return {
		siren,
		denomination: props['ENT_NAM'] || '(sans nom)',
		ville: props['ENT_TOW_CIT_RES'] || null,
		pays: 'FRANCE',
		categorie: mapEbaTypeToCategory(String(raw.EntityType || '')),
		lei: null,
		entityCode: raw.EntityCode ? String(raw.EntityCode) : undefined,
		source: 'eba'
	};
}

export async function parseEbaStream(webStream: ReadableStream): Promise<NormalizedEntity[]> {
	const french: NormalizedEntity[] = [];
	let count = 0;
	for await (const raw of extractJsonObjects(webStream)) {
		count++;
		if (count <= 5) {
			console.error('[EBA] obj #' + count, 'keys:', Object.keys(raw).join(', '));
			if (raw.sectionHeader) console.error('[EBA]   sectionHeader:', JSON.stringify(raw.sectionHeader).slice(0, 100));
			if (raw.line1) console.error('[EBA]   line1 type:', typeof raw.line1, 'isObj:', typeof raw.line1 === 'object');
			if (Array.isArray(raw.line1)) console.error('[EBA]   line1[0] type:', typeof raw.line1[0]);
		}
		if (raw.CA_OwnerID === 'FR_ACPR') {
			const codes: string[] = [];
			if (Array.isArray(raw.Properties)) {
				for (const item of raw.Properties) {
					if (item && typeof item.PropertyCode === 'string') codes.push(item.PropertyCode);
				}
			}
			// console.error('[EBA] FR_ACPR obj, codes:', codes.slice(0, 20).join(', '), 'tot:', codes.length, 'EntityType:', raw.EntityType, 'EntityCode:', raw.EntityCode);
		}
		const entity = normalizeEbaEntity(raw);
		if (entity) french.push(entity);
	}
	console.error('[EBA] total objects:', count, 'french entities:', french.length);
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
