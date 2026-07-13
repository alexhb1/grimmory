import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {mutationOptions, QueryClient} from '@tanstack/angular-query-experimental';
import {lastValueFrom} from 'rxjs';

import {API_CONFIG} from '../../../core/config/api-config';
import {invalidateAllBookQueries} from '../../book/data/book-query-cache';
import {BookFileType} from '../../book/data/book-response.models';
import {libraryCommandKeys, libraryCommandScopes} from './library-command-keys';
import {
  CreateLibraryResult,
  CreateLibraryVariables,
  DeleteLibraryResult,
  DeleteLibraryVariables,
  LibraryDefinitionInput,
  LibraryIcon,
  LibraryMetadataSource,
  LibraryOrganizationMode,
  RefreshLibraryResult,
  RefreshLibraryVariables,
  UpdateLibraryResult,
  UpdateLibraryVariables,
} from './library-command.models';
import {libraryQueryKeys} from './library-query-keys';

const BOOK_FORMATS = new Set<BookFileType>(['PDF', 'EPUB', 'CBX', 'FB2', 'MOBI', 'AZW3', 'AUDIOBOOK']);
const METADATA_SOURCES = new Set<LibraryMetadataSource>([
  'embedded',
  'sidecar',
  'prefer-sidecar',
  'prefer-embedded',
  'none',
]);
const ORGANIZATION_MODES = new Set<LibraryOrganizationMode>([
  'book-per-file',
  'book-per-folder',
  'auto-detect',
]);

const METADATA_SOURCE_PAYLOAD: Readonly<Record<LibraryMetadataSource, string>> = {
  embedded: 'EMBEDDED',
  sidecar: 'SIDECAR',
  'prefer-sidecar': 'PREFER_SIDECAR',
  'prefer-embedded': 'PREFER_EMBEDDED',
  none: 'NONE',
};

const ORGANIZATION_MODE_PAYLOAD: Readonly<Record<LibraryOrganizationMode, string>> = {
  'book-per-file': 'BOOK_PER_FILE',
  'book-per-folder': 'BOOK_PER_FOLDER',
  'auto-detect': 'AUTO_DETECT',
};

@Injectable({providedIn: 'root'})
export class LibraryCommandService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_CONFIG.BASE_URL}/api/v1/libraries`;

  createLibrary() {
    return mutationOptions({
      mutationKey: libraryCommandKeys.create(),
      scope: libraryCommandScopes.libraries,
      mutationFn: ({definition}: CreateLibraryVariables) => this.create(normalizeDefinition(definition)),
      onSuccess: (_result, _variables, _onMutateResult, {client}) => invalidateLibraryDefinitions(client),
      retry: false,
    });
  }

  updateLibrary() {
    return mutationOptions({
      mutationKey: libraryCommandKeys.update(),
      scope: libraryCommandScopes.libraries,
      mutationFn: ({libraryId, definition}: UpdateLibraryVariables) => this.update(
        positiveId(libraryId),
        normalizeDefinition(definition),
      ),
      onSuccess: (_result, _variables, _onMutateResult, {client}) => reconcileLibraries(client),
      retry: false,
    });
  }

  deleteLibrary() {
    return mutationOptions({
      mutationKey: libraryCommandKeys.delete(),
      scope: libraryCommandScopes.libraries,
      mutationFn: ({libraryId}: DeleteLibraryVariables) => this.delete(positiveId(libraryId)),
      onSuccess: (result, _variables, _onMutateResult, {client}) => {
        client.removeQueries({queryKey: libraryQueryKeys.formatCounts(result.libraryId), exact: true});
        return reconcileLibraries(client);
      },
      retry: false,
    });
  }

  refreshLibrary() {
    return mutationOptions({
      mutationKey: libraryCommandKeys.refresh(),
      scope: libraryCommandScopes.libraries,
      mutationFn: ({libraryId}: RefreshLibraryVariables) => this.refresh(positiveId(libraryId)),
      onSuccess: (_result, _variables, _onMutateResult, {client}) => invalidateLibraryDefinitions(client),
      retry: false,
    });
  }

  private async create(definition: LibraryDefinitionInput): Promise<CreateLibraryResult> {
    const response = await lastValueFrom(this.http.post<unknown>(
      this.url,
      encodeDefinition(definition),
    ));
    if (!isRecord(response) || !isPositiveId(response['id']) || typeof response['name'] !== 'string' || response['name'].trim().length === 0) {
      throw new Error('Invalid library creation response.');
    }
    if (response['name'] !== definition.name) {
      throw new Error(`Library response contains unexpected library name ${response['name']}.`);
    }
    return {libraryId: response['id'], name: response['name']};
  }

  private async update(libraryId: number, definition: LibraryDefinitionInput): Promise<UpdateLibraryResult> {
    const response = await lastValueFrom(this.http.put<unknown>(
      `${this.url}/${libraryId}`,
      encodeDefinition(definition),
    ));
    if (!isRecord(response) || !isPositiveId(response['id']) || typeof response['name'] !== 'string' || response['name'].trim().length === 0) {
      throw new Error('Invalid library update response.');
    }
    if (response['id'] !== libraryId) {
      throw new Error(`Library response contains unexpected library ID ${response['id']}.`);
    }
    return {libraryId, name: response['name']};
  }

  private async delete(libraryId: number): Promise<DeleteLibraryResult> {
    await lastValueFrom(this.http.delete<void>(`${this.url}/${libraryId}`));
    return {libraryId};
  }

  private async refresh(libraryId: number): Promise<RefreshLibraryResult> {
    await lastValueFrom(this.http.put<void>(`${this.url}/${libraryId}/refresh`, {}));
    return {libraryId};
  }
}

function reconcileLibraries(client: QueryClient): Promise<void> {
  return Promise.all([
    invalidateLibraryDefinitions(client),
    invalidateAllBookQueries(client),
  ]).then(() => undefined);
}

function invalidateLibraryDefinitions(client: QueryClient): Promise<void> {
  return client.invalidateQueries({queryKey: libraryQueryKeys.definitions(), exact: true});
}

function normalizeDefinition(value: LibraryDefinitionInput): LibraryDefinitionInput {
  if (!isRecord(value)) throw new Error('A library definition is required.');
  const name = trimmed(value.name, 'Library name must not be blank.');
  if (typeof value.watch !== 'boolean') throw new Error('Library watch state must be a boolean.');
  if (!Array.isArray(value.paths)) throw new Error('Library paths must be an array.');
  const paths = [...new Set(value.paths.map(path => trimmed(path, 'Library paths must not be blank.')))];
  if (paths.length === 0) throw new Error('At least one library path is required.');
  return {
    name,
    icon: normalizeIcon(value.icon),
    watch: value.watch,
    paths,
    formatPriority: normalizeFormats(value.formatPriority),
    allowedFormats: normalizeFormats(value.allowedFormats),
    metadataSource: enumValue(value.metadataSource, METADATA_SOURCES, 'library metadata source'),
    organizationMode: enumValue(value.organizationMode, ORGANIZATION_MODES, 'library organization mode'),
  };
}

function encodeDefinition(definition: LibraryDefinitionInput) {
  return {
    name: definition.name,
    icon: definition.icon?.value ?? null,
    iconType: definition.icon?.type ?? null,
    watch: definition.watch,
    paths: definition.paths.map(path => ({path})),
    formatPriority: definition.formatPriority,
    allowedFormats: definition.allowedFormats,
    metadataSource: METADATA_SOURCE_PAYLOAD[definition.metadataSource],
    organizationMode: ORGANIZATION_MODE_PAYLOAD[definition.organizationMode],
  };
}

function normalizeIcon(value: LibraryIcon | null): LibraryIcon | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error('Library icon must be an icon or null.');
  const iconValue = trimmed(value.value, 'Library icon must not be blank.');
  if (value.type !== 'LUCIDE' && value.type !== 'CUSTOM_SVG') throw new Error(`Unsupported library icon type: ${String(value.type)}`);
  return {value: iconValue, type: value.type};
}

function normalizeFormats(values: readonly BookFileType[]): readonly BookFileType[] {
  if (!Array.isArray(values)) throw new Error('Library book formats must be an array.');
  return [...new Set(values.map(value => {
    if (!BOOK_FORMATS.has(value)) throw new Error(`Unsupported library book format: ${String(value)}`);
    return value;
  }))];
}

function enumValue<T extends string>(value: unknown, values: ReadonlySet<T>, label: string): T {
  if (typeof value !== 'string' || !values.has(value as T)) throw new Error(`Unsupported ${label}: ${String(value)}`);
  return value as T;
}

function positiveId(value: unknown): number {
  if (!isPositiveId(value)) throw new Error('Library ID must be a positive safe integer.');
  return value;
}

function trimmed(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(message);
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
