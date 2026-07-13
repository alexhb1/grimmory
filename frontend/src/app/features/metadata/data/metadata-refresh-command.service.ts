import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {mutationOptions, QueryClient} from '@tanstack/angular-query-experimental';
import {lastValueFrom} from 'rxjs';

import {API_CONFIG} from '../../../core/config/api-config';
import {authorQueryKeys} from '../../author-browser/data/author-query-keys';
import {
  invalidateAllBookQueries,
  applyBookQueryChangeSet,
} from '../../book/data/book-query-cache';
import {
  metadataRefreshCommandKeys,
  metadataRefreshCommandScopes,
} from './metadata-refresh-command-keys';
import {
  METADATA_REFRESH_FIELDS,
  METADATA_REFRESH_PROVIDERS,
  MetadataRefreshField,
  MetadataRefreshPreferences,
  MetadataRefreshProvider,
  MetadataRefreshReplaceMode,
  MetadataRefreshTarget,
  RefreshMetadataResult,
  RefreshMetadataVariables,
} from './metadata-refresh-command.models';

type JsonRecord = Record<string, unknown>;

const PROVIDER_PAYLOAD: Readonly<Record<MetadataRefreshProvider, string>> = {
  amazon: 'Amazon',
  goodreads: 'GoodReads',
  google: 'Google',
  hardcover: 'Hardcover',
  comicvine: 'Comicvine',
  douban: 'Douban',
  lubimyczytac: 'Lubimyczytac',
  ranobedb: 'Ranobedb',
  audible: 'Audible',
};

const REPLACE_MODE_PAYLOAD: Readonly<Record<MetadataRefreshReplaceMode, string>> = {
  all: 'REPLACE_ALL',
  missing: 'REPLACE_MISSING',
  provided: 'REPLACE_WHEN_PROVIDED',
};

const FIELD_SET = new Set<string>(METADATA_REFRESH_FIELDS);
const PROVIDER_SET = new Set<string>(METADATA_REFRESH_PROVIDERS);

@Injectable({providedIn: 'root'})
export class MetadataRefreshCommandService {
  private readonly http = inject(HttpClient);
  private readonly taskUrl = `${API_CONFIG.BASE_URL}/api/v1/tasks/start`;

  refreshMetadata() {
    return mutationOptions({
      mutationKey: metadataRefreshCommandKeys.refresh(),
      scope: metadataRefreshCommandScopes.refresh,
      mutationFn: (variables: RefreshMetadataVariables) => this.refresh(
        normalizeTarget(variables?.target),
        normalizePreferences(variables?.preferences),
      ),
      onSuccess: (result, _variables, _onMutateResult, {client}) => reconcileMetadataRefresh(
        client,
        result.target,
      ),
      retry: false,
    });
  }

  private async refresh(
    target: MetadataRefreshTarget,
    preferences: MetadataRefreshPreferences | undefined,
  ): Promise<RefreshMetadataResult> {
    const response = await lastValueFrom(this.http.post<unknown>(this.taskUrl, {
      taskType: 'REFRESH_METADATA_MANUAL',
      triggeredByCron: false,
      options: encodeTarget(target, preferences),
    }));
    decodeCompletedResponse(response);
    return {target};
  }
}

function normalizeTarget(value: unknown): MetadataRefreshTarget {
  if (!isRecord(value) || typeof value['kind'] !== 'string') {
    throw new Error('Metadata refresh target is required.');
  }
  if (value['kind'] === 'books') {
    return {kind: 'books', bookIds: normalizeBookIds(value['bookIds'])};
  }
  if (value['kind'] === 'library') {
    return {kind: 'library', libraryId: positiveId(value['libraryId'], 'Library')};
  }
  throw new Error(`Unsupported metadata refresh target: ${value['kind']}.`);
}

function normalizeBookIds(value: unknown): readonly number[] {
  if (!Array.isArray(value)) {
    throw new Error('Book IDs must be an array.');
  }
  const bookIds = [...new Set(value.map(bookId => positiveId(bookId, 'Book')))];
  if (bookIds.length === 0) {
    throw new Error('At least one book ID is required.');
  }
  return bookIds;
}

function normalizePreferences(value: unknown): MetadataRefreshPreferences | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error('Metadata refresh preferences must be an object.');
  }
  const providersByField = normalizeProvidersByField(value['providersByField']);
  const enabledFields = normalizeEnabledFields(value['enabledFields']);
  return {
    refreshCovers: requiredBoolean(value, 'refreshCovers'),
    mergeCategories: requiredBoolean(value, 'mergeCategories'),
    reviewBeforeApply: requiredBoolean(value, 'reviewBeforeApply'),
    replaceMode: normalizeReplaceMode(value['replaceMode']),
    providersByField,
    enabledFields,
  };
}

function normalizeProvidersByField(
  value: unknown,
): Readonly<Record<MetadataRefreshField, readonly MetadataRefreshProvider[]>> {
  const record = preferenceRecord(value, 'provider preferences');
  rejectUnknownFields(record);
  const normalized: Partial<Record<MetadataRefreshField, readonly MetadataRefreshProvider[]>> = {};
  for (const field of METADATA_REFRESH_FIELDS) {
    if (!Object.hasOwn(record, field) || !Array.isArray(record[field])) {
      throw new Error(`Metadata providers for ${field} must be an array.`);
    }
    const providers = record[field];
    if (providers.length > 4) {
      throw new Error(`Metadata providers for ${field} cannot contain more than four providers.`);
    }
    const decoded = providers.map(provider => normalizeProvider(provider));
    if (new Set(decoded).size !== decoded.length) {
      throw new Error(`Metadata providers for ${field} must not contain duplicates.`);
    }
    normalized[field] = decoded;
  }
  return normalized as Record<MetadataRefreshField, readonly MetadataRefreshProvider[]>;
}

function normalizeEnabledFields(
  value: unknown,
): Readonly<Record<MetadataRefreshField, boolean>> {
  const record = preferenceRecord(value, 'enabled fields');
  rejectUnknownFields(record);
  const normalized: Partial<Record<MetadataRefreshField, boolean>> = {};
  for (const field of METADATA_REFRESH_FIELDS) {
    if (typeof record[field] !== 'boolean') {
      throw new Error(`Metadata enabled field ${field} must be a boolean.`);
    }
    normalized[field] = record[field];
  }
  return normalized as Record<MetadataRefreshField, boolean>;
}

function preferenceRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`Metadata refresh ${label} must be an object.`);
  }
  return value;
}

function rejectUnknownFields(value: JsonRecord): void {
  const unknown = Object.keys(value).find(field => !FIELD_SET.has(field));
  if (unknown !== undefined) {
    throw new Error(`Unsupported metadata refresh field: ${unknown}.`);
  }
}

function normalizeProvider(value: unknown): MetadataRefreshProvider {
  if (typeof value !== 'string' || !PROVIDER_SET.has(value)) {
    throw new Error(`Unsupported metadata provider: ${String(value)}.`);
  }
  return value as MetadataRefreshProvider;
}

function normalizeReplaceMode(value: unknown): MetadataRefreshReplaceMode {
  if (typeof value !== 'string' || !Object.hasOwn(REPLACE_MODE_PAYLOAD, value)) {
    throw new Error(`Unsupported metadata replace mode: ${String(value)}.`);
  }
  return value as MetadataRefreshReplaceMode;
}

function requiredBoolean(value: JsonRecord, field: string): boolean {
  if (typeof value[field] !== 'boolean') {
    throw new Error(`Metadata refresh ${field} must be a boolean.`);
  }
  return value[field];
}

function encodeTarget(
  target: MetadataRefreshTarget,
  preferences: MetadataRefreshPreferences | undefined,
): JsonRecord {
  const options: JsonRecord = target.kind === 'books'
    ? {refreshType: 'BOOKS', bookIds: target.bookIds}
    : {refreshType: 'LIBRARY', libraryId: target.libraryId};
  if (preferences !== undefined) {
    options['refreshOptions'] = encodePreferences(target, preferences);
  }
  return options;
}

function encodePreferences(
  target: MetadataRefreshTarget,
  preferences: MetadataRefreshPreferences,
): JsonRecord {
  const fieldOptions: JsonRecord = {};
  for (const field of METADATA_REFRESH_FIELDS) {
    const providers = preferences.providersByField[field].map(provider => PROVIDER_PAYLOAD[provider]);
    fieldOptions[field] = {
      p1: providers[0] ?? null,
      p2: providers[1] ?? null,
      p3: providers[2] ?? null,
      p4: providers[3] ?? null,
    };
  }
  return {
    libraryId: target.kind === 'library' ? target.libraryId : null,
    refreshCovers: preferences.refreshCovers,
    mergeCategories: preferences.mergeCategories,
    reviewBeforeApply: preferences.reviewBeforeApply,
    replaceMode: REPLACE_MODE_PAYLOAD[preferences.replaceMode],
    fieldOptions,
    enabledFields: preferences.enabledFields,
  };
}

function decodeCompletedResponse(value: unknown): void {
  if (!isRecord(value)
    || typeof value['taskId'] !== 'string'
    || value['taskId'].trim().length === 0
    || value['taskType'] !== 'REFRESH_METADATA_MANUAL'
    || value['status'] !== 'COMPLETED') {
    throw new Error('Invalid metadata refresh response.');
  }
}

function reconcileMetadataRefresh(client: QueryClient, target: MetadataRefreshTarget): Promise<void> {
  const bookWork = target.kind === 'books'
    ? applyBookQueryChangeSet(client, {changedBookIds: target.bookIds})
    : invalidateAllBookQueries(client);
  return Promise.all([
    bookWork,
    client.invalidateQueries({queryKey: authorQueryKeys.all(), exact: true}),
  ]).then(() => undefined);
}

function positiveId(value: unknown, label: 'Book' | 'Library'): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} ID must be a positive safe integer.`);
  }
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
