export type ComparisonStatus =
	| 'match'
	| 'nameMismatch'
	| 'cityMismatch'
	| 'categoryMismatch'
	| 'onlyInRegafi'
	| 'onlyInEba';

export interface EbaProperty {
	PropertyCode: string;
	PropertyValue: string;
}

export interface EbaEntity {
	EntityCode: string;
	EntityType: string;
	__EBA_EntityVersion: number;
	CA_OwnerID: string;
	Properties: EbaProperty[];
}

export interface RegafiFields {
	id_referentiel: string;
	cib: string | null;
	lei: string | null;
	indicateur_psi: string | null;
	type_entite: string | null;
	denomination: string | null;
	nom_commerciaux: string | null;
	sigle: string | null;
	siren: string | null;
	forme_juridique: string | null;
	id_entite_parente: string | null;
	modalite_exercice: string | null;
	adresse: string | null;
	code_postal: string | null;
	ville: string | null;
	pays: string | null;
	categorie: string | null;
	evenements: string | null;
	approval_withdrawal_process: string | null;
	authorisations: string | null;
	mandants: string | null;
	mandataires: string | null;
	passports_sortants: string | null;
	passports_entrants: string | null;
}

export interface RegafiRecord {
	id: number;
	datasetid: string;
	recordid: string;
	fields: RegafiFields;
	geometry: unknown;
	record_timestamp: string;
}

export type CountryRoles =
	| Record<string, string[]>
	| {
			countryCode: string;
			countryName: string;
			roles: string[];
	  };

export interface CountryRoleDetail {
	countryCode: string;
	countryName: string;
	roles: string[];
}

export interface NormalizedEntity {
	siren: string;
	denomination: string;
	ville: string | null;
	pays: string | null;
	categorie: string | null;
	lei: string | null;
	idReferentiel?: string;
	entityCode?: string;
	cib?: string | null;
	entityType?: string | null;
	source: 'regafi' | 'eba';
	authorisations?: string | null;
	rolesByCountry?: CountryRoles[];
	rolesSummary?: string;
}

export interface ComparisonMatch {
	siren: string;
	regafi: NormalizedEntity | null;
	eba: NormalizedEntity | null;
	status: ComparisonStatus;
	differences: string[];
	rolesSummary?: string;
	rolesDetails?: CountryRoleDetail[];
}

export interface ComparisonOptions {
	columns: Array<'siren' | 'denomination'>;
	nameSimilarityThreshold: number;
}

export interface ComparisonResult {
	matches: ComparisonMatch[];
	summary: {
		totalMatches: number;
		totalNameMismatches: number;
		totalCityMismatches: number;
		totalCategoryMismatches: number;
		totalOnlyInRegafi: number;
		totalOnlyInEba: number;
		totalRegafi: number;
		totalEba: number;
	};
}
