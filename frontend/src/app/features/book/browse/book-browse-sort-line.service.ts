import {formatDate} from '@angular/common';
import {Injectable, LOCALE_ID, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {TranslocoService} from '@jsverse/transloco';

import {type BookQuerySortKey} from '../data/book-query-params';
import {type BookSummary} from '../data/book-response.models';
import {bookBrowseColumnValue, bookReadStatusLabelKey} from './book-browse-fields';

const EMPTY_VALUE = '—';

@Injectable({providedIn: 'root'})
export class BookBrowseSortLineService {
  private readonly locale = inject(LOCALE_ID);
  private readonly transloco = inject(TranslocoService);
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  lineFor(key: BookQuerySortKey, book: BookSummary): string {
    this.activeLang();
    const metadata = book.metadata;
    const columnValue = bookBrowseColumnValue(book, key);
    switch (key) {
      case 'addedOn':
      case 'lastReadTime':
      case 'publishedDate':
        return this.date(columnValue);
      case 'dateFinished':
        return this.date(book.dateFinished);
      case 'publisher':
      case 'seriesName':
      case 'language':
        return this.text(columnValue);
      case 'narrator':
        return this.text(metadata?.narrator);
      case 'pageCount':
      case 'amazonReviewCount':
      case 'goodreadsReviewCount':
      case 'hardcoverReviewCount':
        return this.number(columnValue);
      case 'personalRating':
        return this.rating(book.personalRating);
      case 'amazonRating':
      case 'goodreadsRating':
      case 'hardcoverRating':
      case 'ranobedbRating':
        return this.rating(columnValue);
      case 'readingProgress':
        return this.progress(book);
      case 'readStatus':
        return this.readStatus(columnValue);
      case 'title':
      case 'seriesNumber':
        return EMPTY_VALUE;
    }
  }

  private date(value: unknown): string {
    return typeof value === 'string' && value
      ? formatDate(value, 'mediumDate', this.locale)
      : EMPTY_VALUE;
  }

  private text(value: unknown): string {
    return typeof value === 'string' && value ? value : EMPTY_VALUE;
  }

  private number(value: unknown): string {
    return typeof value === 'number' ? new Intl.NumberFormat().format(value) : EMPTY_VALUE;
  }

  private rating(value: unknown): string {
    return typeof value === 'number' ? value.toFixed(1) : EMPTY_VALUE;
  }

  private progress(book: BookSummary): string {
    const percentage =
      book.epubProgress?.percentage ??
      book.pdfProgress?.percentage ??
      book.cbxProgress?.percentage ??
      book.audiobookProgress?.percentage ??
      book.koreaderProgress?.percentage ??
      book.koboProgress?.percentage ??
      null;
    return percentage == null ? EMPTY_VALUE : `${Math.round(percentage)}%`;
  }

  private readStatus(value: unknown): string {
    const labelKey = typeof value === 'string' ? bookReadStatusLabelKey(value) : null;
    return labelKey ? this.transloco.translate(labelKey) : EMPTY_VALUE;
  }
}
