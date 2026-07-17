import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {mutationOptions, QueryClient} from '@tanstack/angular-query-experimental';
import {lastValueFrom} from 'rxjs';

import {API_CONFIG} from '../../../core/config/api-config';
import {normalizeBookIds} from './book-id';
import {reconcileUnlessValidationError, validateBookCommandInput} from './book-command.models';
import {isPositiveSafeInteger} from './json-guards';
import {bookShelfCommandKeys, bookShelfCommandScopes} from './book-shelf-command-keys';
import {
  CreateShelfVariables,
  DeleteShelfVariables,
  UpdateBookShelfMembershipResult,
  UpdateBookShelfMembershipVariables,
  UpdateShelfVariables,
} from './book-shelf-command.models';
import {decodeBookBatch} from './book-query-response-decoder';
import {
  ShelfDefinition,
  ShelfDefinitionInput,
} from './shelf-definition.models';
import {
  invalidateAllBookQueries,
  applyBookQueryChangeSet,
} from './book-query-cache';
import {shelfDefinitionQueryKeys} from './shelf-definition-query-keys';
import {
  decodeShelfDefinition,
  encodeShelfDefinition,
  normalizeShelfDefinition,
} from './shelf-definition-codec';

@Injectable({providedIn: 'root'})
export class BookShelfCommandService {
  private readonly http = inject(HttpClient);
  private readonly membershipUrl = `${API_CONFIG.BASE_URL}/api/v1/books/shelves`;
  private readonly definitionsUrl = `${API_CONFIG.BASE_URL}/api/v1/shelves`;

  updateMembership() {
    return mutationOptions({
      mutationKey: bookShelfCommandKeys.updateMembership(),
      scope: bookShelfCommandScopes.regularShelves,
      mutationFn: (variables: UpdateBookShelfMembershipVariables) => {
        const input = validateBookCommandInput(() => {
          const bookIds = normalizeBookIds(variables.bookIds);
          const assignShelfIds = optionalIds(variables.assignShelfIds, 'Shelf');
          const unassignShelfIds = optionalIds(variables.unassignShelfIds, 'Shelf');
          if (assignShelfIds.length === 0 && unassignShelfIds.length === 0) {
            throw new Error('At least one shelf change is required.');
          }
          const unassigned = new Set(unassignShelfIds);
          if (assignShelfIds.some(shelfId => unassigned.has(shelfId))) {
            throw new Error('A shelf cannot be assigned and unassigned together.');
          }
          return {bookIds, assignShelfIds, unassignShelfIds};
        });
        return this.postMembership(input.bookIds, input.assignShelfIds, input.unassignShelfIds);
      },
      onSuccess: (result, _variables, _onMutateResult, {client}) => Promise.all([
        applyBookQueryChangeSet(client, {changedBookIds: result.confirmedBookIds}),
        invalidateShelfDefinitions(client),
      ]).then(() => undefined),
      onError: (error, variables, _onMutateResult, {client}) => reconcileUnlessValidationError(
        error,
        () => Promise.all([
          applyBookQueryChangeSet(client, {changedBookIds: variables.bookIds}),
          invalidateShelfDefinitions(client),
        ]).then(() => undefined),
      ),
      retry: false,
    });
  }

  createShelf() {
    return mutationOptions({
      mutationKey: bookShelfCommandKeys.create(),
      scope: bookShelfCommandScopes.regularShelves,
      mutationFn: ({definition}: CreateShelfVariables) => {
        const input = validateBookCommandInput(() => normalizeShelfDefinition(definition));
        return this.createDefinition(input);
      },
      onSuccess: (_result, _variables, _onMutateResult, {client}) => invalidateShelfDefinitions(client),
      onError: (error, _variables, _onMutateResult, {client}) => reconcileUnlessValidationError(
        error,
        () => invalidateShelfDefinitions(client),
      ),
      retry: false,
    });
  }

  updateShelf() {
    return mutationOptions({
      mutationKey: bookShelfCommandKeys.update(),
      scope: bookShelfCommandScopes.regularShelves,
      mutationFn: ({shelfId, definition}: UpdateShelfVariables) => {
        const input = validateBookCommandInput(() => ({
          shelfId: positiveId(shelfId, 'Shelf'),
          definition: normalizeShelfDefinition(definition),
        }));
        return this.updateDefinition(input.shelfId, input.definition);
      },
      onSuccess: (_result, _variables, _onMutateResult, {client}) => Promise.all([
        invalidateShelfDefinitions(client),
        invalidateAllBookQueries(client),
      ]).then(() => undefined),
      onError: (error, _variables, _onMutateResult, {client}) => reconcileUnlessValidationError(
        error,
        () => Promise.all([
          invalidateShelfDefinitions(client),
          invalidateAllBookQueries(client),
        ]).then(() => undefined),
      ),
      retry: false,
    });
  }

  deleteShelf() {
    return mutationOptions({
      mutationKey: bookShelfCommandKeys.delete(),
      scope: bookShelfCommandScopes.regularShelves,
      mutationFn: ({shelfId}: DeleteShelfVariables) => {
        const input = validateBookCommandInput(() => ({
          shelfId: positiveId(shelfId, 'Shelf'),
        }));
        return this.deleteDefinition(input.shelfId);
      },
      onSuccess: (_result, _variables, _onMutateResult, {client}) => Promise.all([
        invalidateShelfDefinitions(client),
        invalidateAllBookQueries(client),
      ]).then(() => undefined),
      onError: (error, _variables, _onMutateResult, {client}) => reconcileUnlessValidationError(
        error,
        () => Promise.all([
          invalidateShelfDefinitions(client),
          invalidateAllBookQueries(client),
        ]).then(() => undefined),
      ),
      retry: false,
    });
  }

  private async postMembership(
    bookIds: readonly number[],
    assignShelfIds: readonly number[],
    unassignShelfIds: readonly number[],
  ): Promise<UpdateBookShelfMembershipResult> {
    const response = await lastValueFrom(this.http.post<unknown>(this.membershipUrl, {
      bookIds,
      shelvesToAssign: assignShelfIds,
      shelvesToUnassign: unassignShelfIds,
    }));
    const updatedBookShelves = decodeUpdatedBookShelves(response, bookIds);
    return {
      confirmedBookIds: updatedBookShelves.map(book => book.bookId),
      updatedBookShelves,
    };
  }

  private async createDefinition(
    definition: ShelfDefinitionInput,
  ): Promise<ShelfDefinition> {
    const response = await lastValueFrom(this.http.post<unknown>(
      this.definitionsUrl,
      encodeShelfDefinition(definition),
    ));
    return decodeShelfDefinition(response);
  }

  private async updateDefinition(
    shelfId: number,
    definition: ShelfDefinitionInput,
  ): Promise<ShelfDefinition> {
    const response = await lastValueFrom(this.http.put<unknown>(
      `${this.definitionsUrl}/${shelfId}`,
      encodeShelfDefinition(definition),
    ));
    const result = decodeShelfDefinition(response);
    if (result.id !== shelfId) {
      throw new Error(`Shelf update response contains unexpected shelf ID ${result.id}.`);
    }
    return result;
  }

  private async deleteDefinition(shelfId: number): Promise<void> {
    await lastValueFrom(this.http.delete<void>(
      `${this.definitionsUrl}/${shelfId}`,
    ));
  }
}
function invalidateShelfDefinitions(client: QueryClient): Promise<void> {
  return client.invalidateQueries({
    queryKey: shelfDefinitionQueryKeys.all(),
  });
}

function positiveId(value: unknown, label: string): number {
  if (!isPositiveSafeInteger(value)) {
    throw new Error(`${label} ID must be a positive safe integer.`);
  }
  return value;
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

function decodeUpdatedBookShelves(
  response: unknown,
  requestedBookIds: readonly number[],
): UpdateBookShelfMembershipResult['updatedBookShelves'] {
  try {
    return decodeBookBatch(response, requestedBookIds).map(book => ({
      bookId: book.id,
      shelves: book.shelves ?? [],
    }));
  } catch (cause) {
    throw new Error('Invalid shelf membership response.', {cause});
  }
}
