import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';

import { calculateAuthorUniverseStats } from '../../data/library/author-universe-stats';
import { calculateBookFormatStats } from '../../data/library/book-format-stats';
import { calculateLanguageStats } from '../../data/library/language-stats';
import { calculateLibrarySummaryStats } from '../../data/library/library-summary-stats';
import { calculateMetadataScoreStats } from '../../data/library/metadata-score-stats';
import { calculatePageCountStats } from '../../data/library/page-count-stats';
import { calculatePublicationTimelineStats } from '../../data/library/publication-timeline-stats';
import { calculatePublicationTrendStats } from '../../data/library/publication-trend-stats';
import { calculateReadingJourneyStats } from '../../data/library/reading-journey-stats';
import { calculateTopItemsStats } from '../../data/library/top-items-stats';
import { AllBooksStatsSourceService } from '../shared/all-books-stats-source.service';

export interface LibraryOption {
  readonly id: number | null;
  readonly name: string;
}

@Injectable()
export class LibraryStatsDataService {
  private readonly bookSource = inject(AllBooksStatsSourceService);
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });
  private readonly selectedLibraryId = signal<number | null>(null);

  readonly libraryOptions = computed<readonly LibraryOption[]>(() => {
    this.activeLanguage();
    const libraries = new Map<number, string>();

    for (const book of this.bookSource.books()) {
      if (libraries.has(book.libraryId)) continue;

      const fallbackName = this.transloco.translate(
        'statsLibrary.libraryFilter.libraryFallback',
        { id: book.libraryId },
      );
      libraries.set(book.libraryId, book.libraryName.trim() || fallbackName);
    }

    const availableLibraries = [...libraries]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));

    return [
      {
        id: null,
        name: this.transloco.translate('statsLibrary.libraryFilter.allLibraries'),
      },
      ...availableLibraries,
    ];
  });

  readonly selectedLibrary = computed(() => {
    const selectedLibraryId = this.selectedLibraryId();
    return this.libraryOptions().some((option) => option.id === selectedLibraryId)
      ? selectedLibraryId
      : null;
  });

  private readonly filteredBooks = computed(() => {
    const books = this.bookSource.books();
    const libraryId = this.selectedLibrary();
    return libraryId == null ? books : books.filter((book) => book.libraryId === libraryId);
  });

  readonly statsLoading = this.bookSource.isLoading;
  readonly statsError = this.bookSource.isError;

  readonly bookFormatStats = computed(() => calculateBookFormatStats(this.filteredBooks()));
  readonly languageStats = computed(() => calculateLanguageStats(this.filteredBooks()));
  readonly metadataScoreStats = computed(() => calculateMetadataScoreStats(this.filteredBooks()));
  readonly pageCountStats = computed(() => calculatePageCountStats(this.filteredBooks()));
  readonly readingJourneyStats = computed(() => calculateReadingJourneyStats(this.filteredBooks()));
  readonly publicationTimelineStats = computed(() =>
    calculatePublicationTimelineStats(this.filteredBooks()),
  );
  readonly publicationTrendStats = computed(() =>
    calculatePublicationTrendStats(this.filteredBooks()),
  );
  readonly topItemsStats = computed(() => calculateTopItemsStats(this.filteredBooks()));
  readonly authorUniverseStats = computed(() => calculateAuthorUniverseStats(this.filteredBooks()));
  readonly summaryStats = computed(() => calculateLibrarySummaryStats(this.filteredBooks()));

  setSelectedLibrary(libraryId: number | null): void {
    this.selectedLibraryId.set(libraryId);
  }
}
