import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {mutationOptions} from '@tanstack/angular-query-experimental';
import {lastValueFrom} from 'rxjs';

import {API_CONFIG} from '../../../core/config/api-config';
import {
  bookBackgroundSubmissionKeys,
  bookBackgroundSubmissionScopes,
} from './book-background-submission-keys';
import {
  ChangeCoversResult,
  ChangeCoversVariables,
} from './book-background-submission.models';

@Injectable({providedIn: 'root'})
export class BookBackgroundSubmissionService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_CONFIG.BASE_URL}/api/v1/books`;

  changeCovers() {
    return mutationOptions({
      mutationKey: bookBackgroundSubmissionKeys.changeCovers(),
      scope: bookBackgroundSubmissionScopes.changeCovers,
      mutationFn: (variables: ChangeCoversVariables) => this.requestCoverChanges(variables),
      retry: false,
    });
  }

  private async requestCoverChanges(
    variables: ChangeCoversVariables,
  ): Promise<ChangeCoversResult> {
    if (!isRecord(variables)) {
      throw new Error('Cover change details are required.');
    }
    const requestedBookIds = normalizeBookIds(variables.bookIds);

    switch (variables.kind) {
      case 'upload':
        if (!(variables.file instanceof File)) {
          throw new Error('Bulk cover upload requires a file.');
        }
        await this.uploadCover(requestedBookIds, variables.file);
        break;
      case 'regenerate':
        await this.postBookIds('/bulk-regenerate-covers', requestedBookIds);
        break;
      case 'generate':
        await this.postBookIds('/bulk-generate-custom-covers', requestedBookIds);
        break;
      default:
        throw unsupportedSubmissionKind(variables);
    }

    return {
      kind: variables.kind,
      requestedBookIds,
    };
  }

  private async uploadCover(bookIds: readonly number[], file: File): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bookIds', bookIds.join(','));

    await lastValueFrom(this.http.post<void>(`${this.baseUrl}/bulk-upload-cover`, formData));
  }

  private async postBookIds(path: string, bookIds: readonly number[]): Promise<void> {
    await lastValueFrom(this.http.post<void>(`${this.baseUrl}${path}`, {bookIds}));
  }
}

function normalizeBookIds(bookIds: readonly number[]): readonly number[] {
  if (!Array.isArray(bookIds)) {
    throw new Error('Book IDs must be an array.');
  }
  const normalized = [...new Set(bookIds.map(bookId => positiveBookId(bookId)))];

  if (normalized.length === 0) {
    throw new Error('At least one book ID is required.');
  }

  return normalized;
}

function positiveBookId(bookId: number): number {
  if (!Number.isSafeInteger(bookId) || bookId <= 0) {
    throw new Error('Book ID must be a positive integer.');
  }
  return bookId;
}

function unsupportedSubmissionKind(variables: never): Error {
  const kind = (variables as {kind: string}).kind;
  return new Error(`Unsupported cover change kind: ${kind}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
