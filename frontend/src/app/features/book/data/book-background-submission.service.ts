import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {mutationOptions} from '@tanstack/angular-query-experimental';
import {lastValueFrom} from 'rxjs';

import {API_CONFIG} from '../../../core/config/api-config';
import {normalizeBookIds} from './book-id';
import {
  bookBackgroundSubmissionKeys,
  bookBackgroundSubmissionScopes,
} from './book-background-submission-keys';
import {
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
  ): Promise<void> {
    const requestedBookIds = normalizeBookIds(variables.bookIds);

    switch (variables.kind) {
      case 'regenerate':
        await this.postBookIds('/bulk-regenerate-covers', requestedBookIds);
        return;
      case 'generate':
        await this.postBookIds('/bulk-generate-custom-covers', requestedBookIds);
        return;
    }
  }

  private async postBookIds(path: string, bookIds: readonly number[]): Promise<void> {
    await lastValueFrom(this.http.post<void>(`${this.baseUrl}${path}`, {bookIds}));
  }
}
