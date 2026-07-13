import {HttpTestingController} from '@angular/common/http/testing';
import {inject, Injectable} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {injectMutation, QueryClient} from '@tanstack/angular-query-experimental';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {API_CONFIG} from '../../../core/config/api-config';
import {
  createQueryClientHarness,
  flushSignalAndQueryEffects,
} from '../../../core/testing/query-testing';
import {authorQueryKeys} from '../../author-browser/data/author-query-keys';
import {bookCommandScopes} from '../../book/data/book-command-keys';
import {bookQueryKeys} from '../../book/data/book-query-keys';
import {
  metadataRefreshCommandKeys,
  metadataRefreshCommandScopes,
} from './metadata-refresh-command-keys';
import {
  METADATA_REFRESH_FIELDS,
  MetadataRefreshField,
  MetadataRefreshPreferences,
  MetadataRefreshProvider,
} from './metadata-refresh-command.models';
import {MetadataRefreshCommandService} from './metadata-refresh-command.service';

@Injectable()
class Host {
  private readonly commands = inject(MetadataRefreshCommandService);
  readonly refresh = injectMutation(() => this.commands.refreshMetadata());
}

interface WireFieldOptions {
  readonly p1: string | null;
  readonly p2: string | null;
  readonly p3: string | null;
  readonly p4: string | null;
}

function refreshFieldRecord<TValue>(
  createValue: (field: MetadataRefreshField) => TValue,
): Record<MetadataRefreshField, TValue> {
  const result = {} as Record<MetadataRefreshField, TValue>;
  for (const field of METADATA_REFRESH_FIELDS) {
    result[field] = createValue(field);
  }
  return result;
}

function fullPreferences(): MetadataRefreshPreferences {
  const providersByField = refreshFieldRecord<readonly MetadataRefreshProvider[]>(() => []);
  providersByField.title = ['google', 'goodreads'];
  providersByField.description = ['amazon'];
  const enabledFields = refreshFieldRecord(() => true);
  enabledFields.subtitle = false;
  return {
    refreshCovers: true,
    mergeCategories: false,
    reviewBeforeApply: true,
    replaceMode: 'provided',
    providersByField,
    enabledFields,
  };
}

function completed(taskId = 'metadata-task-1') {
  return {
    taskId,
    taskType: 'REFRESH_METADATA_MANUAL',
    status: 'COMPLETED',
  };
}

describe('MetadataRefreshCommandService', () => {
  let host: Host;
  let service: MetadataRefreshCommandService;
  let queryClient: QueryClient;
  let http: HttpTestingController;

  beforeEach(() => {
    const harness = createQueryClientHarness();
    queryClient = harness.queryClient;
    TestBed.configureTestingModule({
      providers: [...harness.providers, MetadataRefreshCommandService, Host],
    });
    host = TestBed.inject(Host);
    service = TestBed.inject(MetadataRefreshCommandService);
    http = TestBed.inject(HttpTestingController);
    flushSignalAndQueryEffects();
  });

  afterEach(() => {
    http.verify();
    queryClient.clear();
  });

  it('refreshes selected books with server-owned defaults and reconciles their IDs', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const result = host.refresh.mutateAsync({
      target: {kind: 'books', bookIds: [9, 3, 9]},
    });
    await Promise.resolve();
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/tasks/start`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      taskType: 'REFRESH_METADATA_MANUAL',
      triggeredByCron: false,
      options: {refreshType: 'BOOKS', bookIds: [9, 3]},
    });
    request.flush(completed());

    await expect(result).resolves.toEqual({
      target: {kind: 'books', bookIds: [9, 3]},
    });
    expect(invalidate).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(9)});
    expect(invalidate).toHaveBeenCalledWith({queryKey: bookQueryKeys.detailQueries(3)});
    expect(invalidate).toHaveBeenCalledWith({queryKey: authorQueryKeys.all(), exact: true});
  });

  it('refreshes a library with server-owned defaults and broadly reconciles books', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const result = host.refresh.mutateAsync({target: {kind: 'library', libraryId: 4}});
    await Promise.resolve();
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/tasks/start`);
    expect(request.request.body).toEqual({
      taskType: 'REFRESH_METADATA_MANUAL',
      triggeredByCron: false,
      options: {refreshType: 'LIBRARY', libraryId: 4},
    });
    request.flush(completed());

    await expect(result).resolves.toEqual({target: {kind: 'library', libraryId: 4}});
    expect(invalidate).toHaveBeenCalledWith({queryKey: bookQueryKeys.all()});
    expect(invalidate).toHaveBeenCalledWith({queryKey: authorQueryKeys.all(), exact: true});
  });

  it('maps full clean preferences to the current private wire shape', async () => {
    const preferences = fullPreferences();
    const result = host.refresh.mutateAsync({
      target: {kind: 'books', bookIds: [6]},
      preferences,
    });
    await Promise.resolve();
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/tasks/start`);
    const fieldOptions = refreshFieldRecord<WireFieldOptions>(() => ({
      p1: null,
      p2: null,
      p3: null,
      p4: null,
    }));
    fieldOptions['title'] = {p1: 'Google', p2: 'GoodReads', p3: null, p4: null};
    fieldOptions['description'] = {p1: 'Amazon', p2: null, p3: null, p4: null};
    expect(request.request.body).toEqual({
      taskType: 'REFRESH_METADATA_MANUAL',
      triggeredByCron: false,
      options: {
        refreshType: 'BOOKS',
        bookIds: [6],
        refreshOptions: {
          libraryId: null,
          refreshCovers: true,
          mergeCategories: false,
          reviewBeforeApply: true,
          replaceMode: 'REPLACE_WHEN_PROVIDED',
          fieldOptions,
          enabledFields: preferences.enabledFields,
        },
      },
    });
    request.flush(completed());
    await expect(result).resolves.toEqual({target: {kind: 'books', bookIds: [6]}});
  });

  it('maps a full library dialog while keeping the library identity in both wire locations', async () => {
    const result = host.refresh.mutateAsync({
      target: {kind: 'library', libraryId: 4},
      preferences: fullPreferences(),
    });
    await Promise.resolve();
    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/tasks/start`);
    expect(request.request.body.options).toMatchObject({
      refreshType: 'LIBRARY',
      libraryId: 4,
      refreshOptions: {libraryId: 4},
    });
    request.flush(completed());
    await expect(result).resolves.toEqual({target: {kind: 'library', libraryId: 4}});
  });

  it.each([
    {variables: {target: {kind: 'books', bookIds: []}}, message: 'At least one book ID is required.'},
    {variables: {target: {kind: 'books', bookIds: [0]}}, message: 'Book ID must be a positive safe integer.'},
    {variables: {target: {kind: 'library', libraryId: 0}}, message: 'Library ID must be a positive safe integer.'},
    {variables: {target: {kind: 'series', seriesId: 1}}, message: 'Unsupported metadata refresh target: series.'},
  ])('rejects invalid target before transport', async ({variables, message}) => {
    await expect(host.refresh.mutateAsync(variables as never)).rejects.toThrow(message);
    http.expectNone(() => true);
  });

  it('rejects invalid field and provider preference lists before transport', async () => {
    const preferences = fullPreferences();
    await expect(host.refresh.mutateAsync({
      target: {kind: 'books', bookIds: [1]},
      preferences: {
        ...preferences,
        providersByField: {...preferences.providersByField, legacyTitle: ['google']},
      } as never,
    })).rejects.toThrow('Unsupported metadata refresh field: legacyTitle.');
    await expect(host.refresh.mutateAsync({
      target: {kind: 'books', bookIds: [1]},
      preferences: {
        ...preferences,
        providersByField: {...preferences.providersByField, title: ['google', 'unknown']},
      } as never,
    })).rejects.toThrow('Unsupported metadata provider: unknown.');
    await expect(host.refresh.mutateAsync({
      target: {kind: 'books', bookIds: [1]},
      preferences: {
        ...preferences,
        providersByField: {...preferences.providersByField, title: ['google', 'google']},
      },
    })).rejects.toThrow('Metadata providers for title must not contain duplicates.');
    await expect(host.refresh.mutateAsync({
      target: {kind: 'books', bookIds: [1]},
      preferences: {
        ...preferences,
        providersByField: {
          ...preferences.providersByField,
          title: ['google', 'goodreads', 'amazon', 'hardcover', 'audible'],
        },
      },
    })).rejects.toThrow('Metadata providers for title cannot contain more than four providers.');
    http.expectNone(() => true);
  });

  it('rejects invalid enabled fields, booleans, and replace intent before transport', async () => {
    const preferences = fullPreferences();
    await expect(host.refresh.mutateAsync({
      target: {kind: 'books', bookIds: [1]},
      preferences: {
        ...preferences,
        enabledFields: {...preferences.enabledFields, title: 'yes'},
      } as never,
    })).rejects.toThrow('Metadata enabled field title must be a boolean.');
    await expect(host.refresh.mutateAsync({
      target: {kind: 'books', bookIds: [1]},
      preferences: {...preferences, refreshCovers: 'yes'} as never,
    })).rejects.toThrow('Metadata refresh refreshCovers must be a boolean.');
    await expect(host.refresh.mutateAsync({
      target: {kind: 'books', bookIds: [1]},
      preferences: {...preferences, replaceMode: 'overwrite'} as never,
    })).rejects.toThrow('Unsupported metadata replace mode: overwrite.');
    http.expectNone(() => true);
  });

  it.each([
    {response: null},
    {response: {...completed(), taskId: ' '}},
    {response: {...completed(), taskType: 'UPDATE_BOOK_RECOMMENDATIONS'}},
    {response: {...completed(), status: 'ACCEPTED'}},
  ])('rejects an invalid synchronous response before reconciliation', async ({response}) => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const result = host.refresh.mutateAsync({target: {kind: 'books', bookIds: [1]}});
    await Promise.resolve();
    http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/tasks/start`).flush(response);
    await expect(result).rejects.toThrow('Invalid metadata refresh response.');
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('uses reusable stable options with one FIFO scope and no retries', () => {
    const options = service.refreshMetadata();
    expect(options.mutationKey).toEqual(['metadata', 'command', 'refresh']);
    expect(options.mutationKey).toEqual(metadataRefreshCommandKeys.refresh());
    expect(options.scope).toBe(metadataRefreshCommandScopes.refresh);
    expect(options.scope).toBe(bookCommandScopes.metadata);
    expect(options.retry).toBe(false);
  });
});
