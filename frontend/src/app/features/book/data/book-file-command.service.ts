import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {mutationOptions} from '@tanstack/angular-query-experimental';
import {lastValueFrom} from 'rxjs';

import {API_CONFIG} from '../../../core/config/api-config';
import {bookFileCommandKeys, bookFileCommandScopes} from './book-file-command-keys';
import {
  CombineBooksResult,
  CombineBooksVariables,
  OrganizeBookFilesMove,
  OrganizeBookFilesResult,
  OrganizeBookFilesVariables,
} from './book-file-command.models';
import {applyBookQueryChangeSet} from './book-query-cache';

@Injectable({providedIn: 'root'})
export class BookFileCommandService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_CONFIG.BASE_URL}/api/v1/books`;
  private readonly fileOperationsUrl = `${API_CONFIG.BASE_URL}/api/v1/files`;

  combineBooks() {
    return mutationOptions({
      mutationKey: bookFileCommandKeys.combineBooks(),
      scope: bookFileCommandScopes.files,
      mutationFn: (variables: CombineBooksVariables) => this.combine(normalizeCombineBooks(variables)),
      onSuccess: (result, _variables, _onMutateResult, {client}) => applyBookQueryChangeSet(client, {
        changedBookIds: [result.targetBookId],
        deletedBookIds: result.removedSourceBookIds,
      }),
      retry: false,
    });
  }

  organizeFiles() {
    return mutationOptions({
      mutationKey: bookFileCommandKeys.organizeFiles(),
      scope: bookFileCommandScopes.files,
      mutationFn: (variables: OrganizeBookFilesVariables) => this.organize(
        normalizeOrganizeMoves(variables),
      ),
      onSuccess: (result, _variables, _onMutateResult, {client}) => applyBookQueryChangeSet(client, {
        changedBookIds: result.acknowledgedBookIds,
      }),
      retry: false,
    });
  }

  private async combine(variables: CombineBooksVariables): Promise<CombineBooksResult> {
    const response = await lastValueFrom(this.http.post<unknown>(
      `${this.baseUrl}/${variables.targetBookId}/attach-file`,
      {
        sourceBookIds: variables.sourceBookIds,
        moveFiles: variables.moveFiles,
      },
    ));
    return decodeCombinedBooks(response, variables.targetBookId, variables.sourceBookIds);
  }

  private async organize(moves: readonly OrganizeBookFilesMove[]): Promise<OrganizeBookFilesResult> {
    const acknowledgedBookIds = moves.map(move => move.bookId);
    await lastValueFrom(this.http.post<void>(`${this.fileOperationsUrl}/move`, {
      bookIds: acknowledgedBookIds,
      moves,
    }));
    return {acknowledgedBookIds};
  }
}

function positiveId(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function requiredBoolean(value: boolean, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function normalizeCombineBooks(value: CombineBooksVariables): CombineBooksVariables {
  if (!isRecord(value)) {
    throw new Error('Book combination details are required.');
  }
  const targetBookId = positiveId(value.targetBookId, 'Target book ID');
  if (!Array.isArray(value.sourceBookIds)) {
    throw new Error('Source book IDs must be an array.');
  }
  const sourceBookIds = [...new Set(value.sourceBookIds.map(sourceBookId =>
    positiveId(sourceBookId, 'Source book ID')))];
  if (sourceBookIds.length === 0) {
    throw new Error('At least one source book ID is required.');
  }
  if (sourceBookIds.includes(targetBookId)) {
    throw new Error('The target book cannot also be a source book.');
  }
  return {
    targetBookId,
    sourceBookIds,
    moveFiles: requiredBoolean(value.moveFiles, 'Move files preference'),
  };
}

function normalizeOrganizeMoves(
  value: OrganizeBookFilesVariables,
): readonly OrganizeBookFilesMove[] {
  if (!isRecord(value) || !Array.isArray(value.moves)) {
    throw new Error('A book file move plan is required.');
  }
  if (value.moves.length === 0) {
    throw new Error('At least one book file move is required.');
  }

  const movesByBookId = new Map<number, OrganizeBookFilesMove>();
  for (const move of value.moves) {
    if (!isRecord(move)) {
      throw new Error('Every book file move must be an object.');
    }
    const normalizedMove = {
      bookId: positiveId(move['bookId'], 'Book ID'),
      targetLibraryId: positiveId(move['targetLibraryId'], 'Target library ID'),
      targetLibraryPathId: positiveId(move['targetLibraryPathId'], 'Target library path ID'),
    };
    const existing = movesByBookId.get(normalizedMove.bookId);
    if (existing
      && (existing.targetLibraryId !== normalizedMove.targetLibraryId
        || existing.targetLibraryPathId !== normalizedMove.targetLibraryPathId)) {
      throw new Error(`Book ${normalizedMove.bookId} has conflicting move destinations.`);
    }
    movesByBookId.set(normalizedMove.bookId, normalizedMove);
  }
  return [...movesByBookId.values()];
}

function decodeCombinedBooks(
  response: unknown,
  expectedTargetBookId: number,
  sourceBookIds: readonly number[],
): CombineBooksResult {
  if (!isRecord(response)
    || !isRecord(response['updatedBook'])
    || !isPositiveSafeInteger(response['updatedBook']['id'])
    || !Array.isArray(response['deletedSourceBookIds'])) {
    throw new Error('Invalid combined books response.');
  }
  const targetBookId = response['updatedBook']['id'];
  if (targetBookId !== expectedTargetBookId) {
    throw new Error(`Combined book response contains unexpected target book ID ${targetBookId}.`);
  }

  const requestedSources = new Set(sourceBookIds);
  const removedSourceBookIds: number[] = [];
  const seen = new Set<number>();
  for (const sourceBookId of response['deletedSourceBookIds']) {
    if (!isPositiveSafeInteger(sourceBookId)
      || !requestedSources.has(sourceBookId)
      || seen.has(sourceBookId)) {
      throw new Error('Invalid combined books response.');
    }
    seen.add(sourceBookId);
    removedSourceBookIds.push(sourceBookId);
  }
  return {targetBookId, removedSourceBookIds};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
