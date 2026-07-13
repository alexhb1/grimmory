import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {mutationOptions, QueryClient} from '@tanstack/angular-query-experimental';
import {lastValueFrom} from 'rxjs';

import {API_CONFIG} from '../../../core/config/api-config';
import {
  ShelfIcon,
  ShelfVisibility,
} from '../../book/data/book-shelf-command.models';
import {invalidateBookCollections} from '../../book/data/book-query-cache';
import {magicShelfCommandKeys, magicShelfCommandScopes} from './magic-shelf-command-keys';
import {
  DeleteMagicShelfResult,
  DeleteMagicShelfVariables,
  MagicShelfDefinition,
  MagicShelfDefinitionInput,
  MagicShelfFilterGroup,
  MagicShelfFilterValue,
  MagicShelfRule,
  SaveMagicShelfVariables,
} from './magic-shelf-command.models';
import {magicShelfQueryKeys} from './magic-shelf-query-keys';

@Injectable({providedIn: 'root'})
export class MagicShelfCommandService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_CONFIG.BASE_URL}/api/magic-shelves`;

  saveShelf() {
    return mutationOptions({
      mutationKey: magicShelfCommandKeys.save(),
      scope: magicShelfCommandScopes.definitions,
      mutationFn: ({shelfId, definition}: SaveMagicShelfVariables) => this.save(
        shelfId === undefined ? undefined : positiveId(shelfId),
        normalizeDefinition(definition),
      ),
      onSuccess: (_result, _variables, _onMutateResult, {client}) => reconcileMagicShelfChange(client),
      retry: false,
    });
  }

  deleteShelf() {
    return mutationOptions({
      mutationKey: magicShelfCommandKeys.delete(),
      scope: magicShelfCommandScopes.definitions,
      mutationFn: ({shelfId}: DeleteMagicShelfVariables) => this.delete(positiveId(shelfId)),
      onSuccess: (_result, _variables, _onMutateResult, {client}) => reconcileMagicShelfChange(client),
      retry: false,
    });
  }

  private async save(
    shelfId: number | undefined,
    definition: MagicShelfDefinitionInput,
  ): Promise<MagicShelfDefinition> {
    const response = await lastValueFrom(this.http.post<unknown>(this.url, {
      ...(shelfId === undefined ? {} : {id: shelfId}),
      name: definition.name,
      icon: definition.icon?.value ?? null,
      iconType: definition.icon?.type ?? null,
      filterJson: JSON.stringify(definition.filter),
      isPublic: definition.visibility === 'public',
    }));
    const result = decodeDefinition(response);
    if (shelfId !== undefined && result.id !== shelfId) {
      throw new Error(`Magic shelf response contains unexpected shelf ID ${result.id}.`);
    }
    return result;
  }

  private async delete(shelfId: number): Promise<DeleteMagicShelfResult> {
    await lastValueFrom(this.http.delete<void>(`${this.url}/${shelfId}`));
    return {shelfId};
  }
}

function reconcileMagicShelfChange(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({
      queryKey: magicShelfQueryKeys.all(),
    }),
    invalidateBookCollections(client),
  ]).then(() => undefined);
}

function normalizeDefinition(definition: MagicShelfDefinitionInput): MagicShelfDefinitionInput {
  if (!isRecord(definition)) {
    throw new Error('A magic shelf definition is required.');
  }
  const name = requiredTrimmedString(definition.name, 'Magic shelf name must not be blank.');
  if (name.length > 255) {
    throw new Error('Magic shelf name must not exceed 255 characters.');
  }
  const icon = normalizeIcon(definition.icon);
  if (icon && icon.value.length > 64) {
    throw new Error('Magic shelf icon must not exceed 64 characters.');
  }
  return {
    name,
    icon,
    visibility: normalizeVisibility(definition.visibility),
    filter: normalizeFilterGroup(definition.filter),
  };
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

  let filter: MagicShelfFilterGroup;
  let icon: ShelfIcon | null;
  try {
    filter = normalizeFilterGroup(parsedFilter);
    icon = decodeIcon(response['icon'], response['iconType']);
  } catch {
    throw new Error('Invalid magic shelf response.');
  }

  return {
    id,
    name,
    icon,
    visibility: isPublic ? 'public' : 'private',
    filter,
  };
}

function normalizeFilterGroup(value: unknown): MagicShelfFilterGroup {
  if (!isRecord(value) || value['type'] !== 'group') {
    throw new Error('Invalid magic shelf filter.');
  }
  const name = requiredTrimmedString(value['name'], 'Invalid magic shelf filter.');
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
      ? normalizeFilterGroup(rule)
      : normalizeRule(rule)),
  };
}

function normalizeRule(value: unknown): MagicShelfRule {
  if (!isRecord(value) || Object.hasOwn(value, 'type')) {
    throw new Error('Invalid magic shelf filter.');
  }
  const field = requiredTrimmedString(value['field'], 'Invalid magic shelf filter.');
  const operator = requiredTrimmedString(value['operator'], 'Invalid magic shelf filter.');
  const rule: {
    field: string;
    operator: string;
    value?: MagicShelfFilterValue;
    valueStart?: MagicShelfFilterValue;
    valueEnd?: MagicShelfFilterValue;
  } = {field, operator};

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

function normalizeIcon(icon: ShelfIcon | null): ShelfIcon | null {
  if (icon === null) {
    return null;
  }
  if (!isRecord(icon)) {
    throw new Error('Magic shelf icon must be an icon or null.');
  }
  const value = requiredTrimmedString(icon.value, 'Magic shelf icon must not be blank.');
  if (icon.type !== 'LUCIDE' && icon.type !== 'CUSTOM_SVG') {
    throw new Error(`Unsupported shelf icon type: ${String(icon.type)}`);
  }
  return {value, type: icon.type};
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

function normalizeVisibility(value: unknown): ShelfVisibility {
  if (value !== 'private' && value !== 'public') {
    throw new Error(`Unsupported shelf visibility: ${String(value)}`);
  }
  return value;
}

function positiveId(value: unknown): number {
  if (!isPositiveSafeInteger(value)) {
    throw new Error('Magic shelf ID must be a positive safe integer.');
  }
  return value;
}

function requiredTrimmedString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }
  return value.trim();
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
