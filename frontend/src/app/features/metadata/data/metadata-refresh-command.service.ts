import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {mutationOptions, QueryClient} from '@tanstack/angular-query-experimental';
import {lastValueFrom} from 'rxjs';

import {API_CONFIG} from '../../../core/config/api-config';
import {AUTHORS_QUERY_KEY} from '../../author-browser/service/author-query-keys';
import {invalidateAllBookQueries} from '../../book/data/book-query-cache';
import {normalizeBookIds} from '../../book/data/book-id';
import {isPositiveSafeInteger, isRecord} from '../../book/data/json-guards';
import {
  metadataRefreshCommandKeys,
  metadataRefreshCommandScopes,
} from './metadata-refresh-command-keys';
import {
  MetadataRefreshTarget,
  RefreshMetadataResult,
  RefreshMetadataVariables,
} from './metadata-refresh-command.models';

type JsonRecord = Record<string, unknown>;

@Injectable({providedIn: 'root'})
export class MetadataRefreshCommandService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = inject(QueryClient);
  private readonly taskUrl = `${API_CONFIG.BASE_URL}/api/v1/tasks/start`;

  refreshMetadata() {
    return mutationOptions({
      mutationKey: metadataRefreshCommandKeys.refresh(),
      scope: metadataRefreshCommandScopes.refresh,
      mutationFn: (variables: RefreshMetadataVariables) => this.refresh(
        normalizeTarget(variables?.target),
      ),
      retry: false,
    });
  }

  private async refresh(target: MetadataRefreshTarget): Promise<RefreshMetadataResult> {
    const response = await lastValueFrom(this.http.post<unknown>(this.taskUrl, {
      taskType: 'REFRESH_METADATA_MANUAL',
      triggeredByCron: false,
      options: encodeTarget(target),
    }));
    return {taskId: decodeAcceptedResponse(response)};
  }

  handleBatchProgress(payload: unknown): void {
    if (!isRecord(payload) || payload['status'] !== 'COMPLETED') {
      return;
    }
    void reconcileMetadataRefresh(this.queryClient);
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
    const libraryId = value['libraryId'];
    if (!isPositiveSafeInteger(libraryId)) {
      throw new Error('Library ID must be a positive safe integer.');
    }
    return {kind: 'library', libraryId};
  }
  throw new Error(`Unsupported metadata refresh target: ${value['kind']}.`);
}

function encodeTarget(target: MetadataRefreshTarget): JsonRecord {
  return target.kind === 'books'
    ? {refreshType: 'BOOKS', bookIds: target.bookIds}
    : {refreshType: 'LIBRARY', libraryId: target.libraryId};
}

function decodeAcceptedResponse(value: unknown): string {
  if (!isRecord(value)
    || typeof value['taskId'] !== 'string'
    || value['taskId'].trim().length === 0
    || value['taskType'] !== 'REFRESH_METADATA_MANUAL'
    || value['status'] !== 'ACCEPTED') {
    throw new Error('Invalid metadata refresh response.');
  }
  return value['taskId'];
}

function reconcileMetadataRefresh(client: QueryClient): Promise<void> {
  return Promise.all([
    invalidateAllBookQueries(client),
    client.invalidateQueries({queryKey: AUTHORS_QUERY_KEY, exact: true}),
  ]).then(() => undefined);
}
