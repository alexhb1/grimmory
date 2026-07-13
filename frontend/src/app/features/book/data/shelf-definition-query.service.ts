import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {queryOptions} from '@tanstack/angular-query-experimental';
import {lastValueFrom, Observable} from 'rxjs';
import {map, takeUntil} from 'rxjs/operators';

import {API_CONFIG} from '../../../core/config/api-config';
import {retryTransientBookQueryError} from './book-query.service';
import {ShelfDefinition, ShelfIcon} from './book-shelf-command.models';
import {shelfDefinitionQueryKeys} from './shelf-definition-query-keys';

@Injectable({providedIn: 'root'})
export class ShelfDefinitionQueryService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_CONFIG.BASE_URL}/api/v1/shelves`;

  definitions() {
    return queryOptions({
      queryKey: shelfDefinitionQueryKeys.definitions(),
      queryFn: ({signal}): Promise<ShelfDefinition[]> => lastValueFrom(
        this.http.get<unknown>(this.url).pipe(
          map(decodeDefinitions),
          takeUntil(abortSignal(signal)),
        ),
      ),
      staleTime: 30_000,
      retry: retryTransientBookQueryError,
    });
  }
}

function decodeDefinitions(response: unknown): ShelfDefinition[] {
  if (!Array.isArray(response)) {
    throw new Error('Invalid shelf definitions response.');
  }
  return response.map(decodeDefinition);
}

function decodeDefinition(response: unknown): ShelfDefinition {
  if (!isRecord(response)) {
    throw new Error('Invalid shelf definition response.');
  }
  const id = response['id'];
  const name = response['name'];
  const publicShelf = response['publicShelf'];
  const bookCount = response['bookCount'];
  if (
    !isPositiveSafeInteger(id)
    || typeof name !== 'string'
    || name.trim().length === 0
    || typeof publicShelf !== 'boolean'
    || !isNonNegativeSafeInteger(bookCount)
  ) {
    throw new Error('Invalid shelf definition response.');
  }

  return {
    id,
    name,
    icon: decodeIcon(response['icon'], response['iconType']),
    visibility: publicShelf ? 'public' : 'private',
    bookCount,
  };
}

function decodeIcon(value: unknown, type: unknown): ShelfIcon | null {
  if (value === undefined || value === null) {
    if (type !== undefined && type !== null) {
      throw new Error('Invalid shelf definition response.');
    }
    return null;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Invalid shelf definition response.');
  }
  if (type !== undefined && type !== null && type !== 'LUCIDE' && type !== 'CUSTOM_SVG') {
    throw new Error('Invalid shelf definition response.');
  }
  return {value, type: type === 'CUSTOM_SVG' ? 'CUSTOM_SVG' : 'LUCIDE'};
}

function abortSignal(signal: AbortSignal): Observable<void> {
  return new Observable(subscriber => {
    if (signal.aborted) {
      subscriber.next();
      subscriber.complete();
      return;
    }
    const onAbort = () => {
      subscriber.next();
      subscriber.complete();
    };
    signal.addEventListener('abort', onAbort, {once: true});
    return () => signal.removeEventListener('abort', onAbort);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
