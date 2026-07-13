import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {queryOptions} from '@tanstack/angular-query-experimental';
import {lastValueFrom, Observable} from 'rxjs';
import {map, takeUntil} from 'rxjs/operators';

import {API_CONFIG} from '../../../core/config/api-config';
import {ShelfIcon} from '../../book/data/book-shelf-command.models';
import {retryTransientBookQueryError} from '../../book/data/book-query.service';
import {
  MagicShelfDefinition,
  MagicShelfFilterGroup,
  MagicShelfFilterValue,
  MagicShelfRule,
} from './magic-shelf-command.models';
import {magicShelfQueryKeys} from './magic-shelf-query-keys';

@Injectable({providedIn: 'root'})
export class MagicShelfQueryService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_CONFIG.BASE_URL}/api/magic-shelves`;

  definitions() {
    return queryOptions({
      queryKey: magicShelfQueryKeys.definitions(),
      queryFn: ({signal}): Promise<MagicShelfDefinition[]> => lastValueFrom(
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

function decodeDefinitions(response: unknown): MagicShelfDefinition[] {
  if (!Array.isArray(response)) {
    throw new Error('Invalid magic shelf definitions response.');
  }
  return response.map(decodeDefinition);
}

function decodeDefinition(response: unknown): MagicShelfDefinition {
  if (!isRecord(response)) {
    throw new Error('Invalid magic shelf response.');
  }
  const id = response['id'];
  const name = response['name'];
  const isPublic = response['isPublic'];
  const filterJson = response['filterJson'];
  if (
    !isPositiveSafeInteger(id)
    || typeof name !== 'string'
    || name.trim().length === 0
    || name.length > 255
    || typeof isPublic !== 'boolean'
    || typeof filterJson !== 'string'
  ) {
    throw new Error('Invalid magic shelf response.');
  }

  let parsedFilter: unknown;
  try {
    parsedFilter = JSON.parse(filterJson) as unknown;
  } catch {
    throw new Error('Invalid magic shelf response.');
  }

  try {
    return {
      id,
      name,
      icon: decodeIcon(response['icon'], response['iconType']),
      visibility: isPublic ? 'public' : 'private',
      filter: decodeFilterGroup(parsedFilter),
    };
  } catch {
    throw new Error('Invalid magic shelf response.');
  }
}

function decodeFilterGroup(value: unknown): MagicShelfFilterGroup {
  if (!isRecord(value) || value['type'] !== 'group') {
    throw new Error('Invalid magic shelf filter.');
  }
  const name = requiredTrimmedString(value['name']);
  const join = value['join'];
  const rules = value['rules'];
  if ((join !== 'and' && join !== 'or') || !Array.isArray(rules) || rules.length === 0) {
    throw new Error('Invalid magic shelf filter.');
  }
  return {
    name,
    type: 'group',
    join,
    rules: rules.map(rule => isRecord(rule) && rule['type'] === 'group'
      ? decodeFilterGroup(rule)
      : decodeRule(rule)),
  };
}

function decodeRule(value: unknown): MagicShelfRule {
  if (!isRecord(value) || Object.hasOwn(value, 'type')) {
    throw new Error('Invalid magic shelf filter.');
  }
  const rule: {
    field: string;
    operator: string;
    value?: MagicShelfFilterValue;
    valueStart?: MagicShelfFilterValue;
    valueEnd?: MagicShelfFilterValue;
  } = {
    field: requiredTrimmedString(value['field']),
    operator: requiredTrimmedString(value['operator']),
  };
  for (const key of ['value', 'valueStart', 'valueEnd'] as const) {
    if (Object.hasOwn(value, key)) {
      assertFilterValue(value[key]);
      rule[key] = value[key];
    }
  }
  return rule;
}

function assertFilterValue(value: unknown): asserts value is MagicShelfFilterValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  ) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertFilterValue);
    return;
  }
  if (isPlainRecord(value)) {
    Object.values(value).forEach(assertFilterValue);
    return;
  }
  throw new Error('Invalid magic shelf filter.');
}

function decodeIcon(value: unknown, type: unknown): ShelfIcon | null {
  if (value === undefined || value === null) {
    if (type !== undefined && type !== null) {
      throw new Error('Invalid magic shelf icon.');
    }
    return null;
  }
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 64) {
    throw new Error('Invalid magic shelf icon.');
  }
  if (type !== undefined && type !== null && type !== 'LUCIDE' && type !== 'CUSTOM_SVG') {
    throw new Error('Invalid magic shelf icon.');
  }
  return {value, type: type === 'CUSTOM_SVG' ? 'CUSTOM_SVG' : 'LUCIDE'};
}

function requiredTrimmedString(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Invalid magic shelf filter.');
  }
  return value.trim();
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
