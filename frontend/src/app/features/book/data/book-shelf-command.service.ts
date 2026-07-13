import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {mutationOptions, QueryClient} from '@tanstack/angular-query-experimental';
import {lastValueFrom} from 'rxjs';

import {API_CONFIG} from '../../../core/config/api-config';
import {bookShelfCommandKeys, bookShelfCommandScopes} from './book-shelf-command-keys';
import {
  CreateShelfVariables,
  DeleteShelfResult,
  DeleteShelfVariables,
  ShelfDefinition,
  ShelfDefinitionInput,
  ShelfIcon,
  UpdateBookShelfMembershipResult,
  UpdateBookShelfMembershipVariables,
  UpdateShelfVariables,
} from './book-shelf-command.models';
import {
  invalidateAllBookQueries,
  applyBookQueryChangeSet,
} from './book-query-cache';
import {shelfDefinitionQueryKeys} from './shelf-definition-query-keys';

@Injectable({providedIn: 'root'})
export class BookShelfCommandService {
  private readonly http = inject(HttpClient);
  private readonly membershipUrl = `${API_CONFIG.BASE_URL}/api/v1/books/shelves`;
  private readonly definitionsUrl = `${API_CONFIG.BASE_URL}/api/v1/shelves`;

  updateMembership() {
    return mutationOptions({
      mutationKey: bookShelfCommandKeys.updateMembership(),
      scope: bookShelfCommandScopes.regularShelves,
      mutationFn: (variables: UpdateBookShelfMembershipVariables) => this.postMembership(
        requiredIds(variables.bookIds, 'Book'),
        optionalIds(variables.assignShelfIds, 'Shelf'),
        optionalIds(variables.unassignShelfIds, 'Shelf'),
      ),
      onSuccess: (result, _variables, _onMutateResult, {client}) => Promise.all([
        applyBookQueryChangeSet(client, {changedBookIds: result.confirmedBookIds}),
        invalidateShelfDefinitions(client),
      ]).then(() => undefined),
      retry: false,
    });
  }

  createShelf() {
    return mutationOptions({
      mutationKey: bookShelfCommandKeys.create(),
      scope: bookShelfCommandScopes.regularShelves,
      mutationFn: ({definition}: CreateShelfVariables) => this.createDefinition(
        normalizeDefinition(definition),
      ),
      onSuccess: (_result, _variables, _onMutateResult, {client}) => invalidateShelfDefinitions(client),
      retry: false,
    });
  }

  updateShelf() {
    return mutationOptions({
      mutationKey: bookShelfCommandKeys.update(),
      scope: bookShelfCommandScopes.regularShelves,
      mutationFn: ({shelfId, definition}: UpdateShelfVariables) => this.updateDefinition(
        positiveId(shelfId, 'Shelf'),
        normalizeDefinition(definition),
      ),
      onSuccess: (_result, _variables, _onMutateResult, {client}) => Promise.all([
        invalidateShelfDefinitions(client),
        invalidateAllBookQueries(client),
      ]).then(() => undefined),
      retry: false,
    });
  }

  deleteShelf() {
    return mutationOptions({
      mutationKey: bookShelfCommandKeys.delete(),
      scope: bookShelfCommandScopes.regularShelves,
      mutationFn: ({shelfId}: DeleteShelfVariables) => this.deleteDefinition(
        positiveId(shelfId, 'Shelf'),
      ),
      onSuccess: (_result, _variables, _onMutateResult, {client}) => Promise.all([
        invalidateShelfDefinitions(client),
        invalidateAllBookQueries(client),
      ]).then(() => undefined),
      retry: false,
    });
  }

  private async postMembership(
    bookIds: readonly number[],
    assignShelfIds: readonly number[],
    unassignShelfIds: readonly number[],
  ): Promise<UpdateBookShelfMembershipResult> {
    if (assignShelfIds.length === 0 && unassignShelfIds.length === 0) {
      throw new Error('At least one shelf change is required.');
    }
    const unassigned = new Set(unassignShelfIds);
    if (assignShelfIds.some(shelfId => unassigned.has(shelfId))) {
      throw new Error('A shelf cannot be assigned and unassigned together.');
    }

    const response = await lastValueFrom(this.http.post<unknown>(this.membershipUrl, {
      bookIds,
      shelvesToAssign: assignShelfIds,
      shelvesToUnassign: unassignShelfIds,
    }));

    return {
      confirmedBookIds: decodeConfirmedBookIds(response, bookIds),
      assignedShelfIds: assignShelfIds,
      unassignedShelfIds: unassignShelfIds,
    };
  }

  private async createDefinition(
    definition: ShelfDefinitionInput,
  ): Promise<ShelfDefinition> {
    const response = await lastValueFrom(this.http.post<unknown>(
      this.definitionsUrl,
      encodeDefinition(definition),
    ));
    return decodeDefinition(response);
  }

  private async updateDefinition(
    shelfId: number,
    definition: ShelfDefinitionInput,
  ): Promise<ShelfDefinition> {
    const response = await lastValueFrom(this.http.put<unknown>(
      `${this.definitionsUrl}/${shelfId}`,
      encodeDefinition(definition),
    ));
    const result = decodeDefinition(response);
    if (result.id !== shelfId) {
      throw new Error(`Shelf update response contains unexpected shelf ID ${result.id}.`);
    }
    return result;
  }

  private async deleteDefinition(shelfId: number): Promise<DeleteShelfResult> {
    await lastValueFrom(this.http.delete<void>(
      `${this.definitionsUrl}/${shelfId}`,
    ));
    return {shelfId};
  }
}

function invalidateShelfDefinitions(client: QueryClient): Promise<void> {
  return client.invalidateQueries({
    queryKey: shelfDefinitionQueryKeys.all(),
  });
}

function normalizeDefinition(definition: ShelfDefinitionInput): ShelfDefinitionInput {
  if (!isRecord(definition)) {
    throw new Error('A shelf definition is required.');
  }
  const name = requiredTrimmedString(definition.name, 'Shelf name must not be blank.');
  const visibility = definition.visibility;
  if (visibility !== 'private' && visibility !== 'public') {
    throw new Error(`Unsupported shelf visibility: ${String(visibility)}`);
  }

  return {
    name,
    icon: normalizeIcon(definition.icon),
    visibility,
  };
}

function normalizeIcon(icon: ShelfIcon | null): ShelfIcon | null {
  if (icon === null) {
    return null;
  }
  if (!isRecord(icon)) {
    throw new Error('Shelf icon must be an icon or null.');
  }
  const value = requiredTrimmedString(icon.value, 'Shelf icon value must not be blank.');
  if (icon.type !== 'LUCIDE' && icon.type !== 'CUSTOM_SVG') {
    throw new Error(`Unsupported shelf icon type: ${String(icon.type)}`);
  }
  return {value, type: icon.type};
}

function encodeDefinition(definition: ShelfDefinitionInput) {
  return {
    name: definition.name,
    icon: definition.icon?.value ?? null,
    iconType: definition.icon?.type ?? null,
    publicShelf: definition.visibility === 'public',
  };
}

function decodeDefinition(response: unknown): ShelfDefinition {
  if (!isRecord(response)) {
    throw new Error('Invalid shelf definition response.');
  }
  const id = response['id'];
  const name = response['name'];
  const publicShelf = response['publicShelf'];
  if (
    !isPositiveSafeInteger(id)
    || typeof name !== 'string'
    || name.trim().length === 0
    || typeof publicShelf !== 'boolean'
  ) {
    throw new Error('Invalid shelf definition response.');
  }

  let icon: ShelfIcon | null = null;
  const iconValue = response['icon'];
  const iconType = response['iconType'];
  if (iconValue !== undefined && iconValue !== null) {
    if (typeof iconValue !== 'string' || iconValue.trim().length === 0) {
      throw new Error('Invalid shelf definition response.');
    }
    if (
      iconType !== undefined
      && iconType !== null
      && iconType !== 'LUCIDE'
      && iconType !== 'CUSTOM_SVG'
    ) {
      throw new Error('Invalid shelf definition response.');
    }
    icon = {
      value: iconValue,
      type: iconType === 'CUSTOM_SVG' ? 'CUSTOM_SVG' : 'LUCIDE',
    };
  } else if (iconType !== undefined && iconType !== null) {
    throw new Error('Invalid shelf definition response.');
  }

  return {
    id,
    name,
    icon,
    visibility: publicShelf ? 'public' : 'private',
  };
}

function requiredTrimmedString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }
  return value.trim();
}

function positiveId(value: unknown, label: string): number {
  if (!isPositiveSafeInteger(value)) {
    throw new Error(`${label} ID must be a positive safe integer.`);
  }
  return value;
}

function requiredIds(values: readonly number[], label: string): readonly number[] {
  const ids = optionalIds(values, label);
  if (ids.length === 0) {
    throw new Error(`At least one ${label.toLowerCase()} ID is required.`);
  }
  return ids;
}

function optionalIds(values: readonly number[], label: string): readonly number[] {
  if (!Array.isArray(values)) {
    throw new Error(`${label} IDs must be an array.`);
  }
  if (values.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error(`${label} IDs must be positive integers.`);
  }
  return [...new Set(values)];
}

function decodeConfirmedBookIds(response: unknown, requestedBookIds: readonly number[]): readonly number[] {
  if (!Array.isArray(response)) {
    throw new Error('Invalid shelf membership response.');
  }
  const requested = new Set(requestedBookIds);
  const confirmedBookIds: number[] = [];
  const seen = new Set<number>();
  for (const book of response) {
    if (!isRecord(book) || !isPositiveSafeInteger(book['id'])) {
      throw new Error('Invalid shelf membership response.');
    }
    const bookId = book['id'];
    if (!requested.has(bookId)) {
      throw new Error(`Shelf membership response contains unexpected book ID ${bookId}.`);
    }
    if (seen.has(bookId)) {
      throw new Error(`Shelf membership response contains duplicate book ID ${bookId}.`);
    }
    seen.add(bookId);
    confirmedBookIds.push(bookId);
  }
  return confirmedBookIds;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
