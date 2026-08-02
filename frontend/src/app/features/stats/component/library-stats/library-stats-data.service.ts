import { computed, inject, Injectable } from '@angular/core';

import { BookService } from '../../../book/service/book.service';
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
import { LibraryFilterService } from './service/library-filter.service';

@Injectable()
export class LibraryStatsDataService {
  private readonly bookService = inject(BookService);
  private readonly libraryFilter = inject(LibraryFilterService);

  private readonly filteredBooks = computed(() => {
    if (this.bookService.isBooksLoading()) return [];

    const books = this.bookService.books();
    const libraryId = this.libraryFilter.selectedLibrary();
    return libraryId == null ? books : books.filter((book) => book.libraryId === libraryId);
  });

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
}
