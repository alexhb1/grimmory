import {BookFileType} from '../../book/data/book-response.models';

export type LibraryIconType = 'LUCIDE' | 'CUSTOM_SVG';
export type LibraryMetadataSource = 'embedded' | 'sidecar' | 'prefer-sidecar' | 'prefer-embedded' | 'none';
export type LibraryOrganizationMode = 'book-per-file' | 'book-per-folder' | 'auto-detect';

export interface LibraryIcon {
  readonly value: string;
  readonly type: LibraryIconType;
}

export interface LibraryDefinitionInput {
  readonly name: string;
  readonly icon: LibraryIcon | null;
  readonly watch: boolean;
  readonly paths: readonly string[];
  readonly formatPriority: readonly BookFileType[];
  readonly allowedFormats: readonly BookFileType[];
  readonly metadataSource: LibraryMetadataSource;
  readonly organizationMode: LibraryOrganizationMode;
}

export interface CreateLibraryVariables {
  readonly definition: LibraryDefinitionInput;
}

export interface CreateLibraryResult {
  readonly libraryId: number;
  readonly name: string;
}

export interface UpdateLibraryVariables {
  readonly libraryId: number;
  readonly definition: LibraryDefinitionInput;
}

export interface UpdateLibraryResult {
  readonly libraryId: number;
  readonly name: string;
}

export interface DeleteLibraryVariables {
  readonly libraryId: number;
}

export interface DeleteLibraryResult {
  readonly libraryId: number;
}

export interface RefreshLibraryVariables {
  readonly libraryId: number;
}

export interface RefreshLibraryResult {
  readonly libraryId: number;
}
