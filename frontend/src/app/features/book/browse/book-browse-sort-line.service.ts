import {Injectable, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {TranslocoService} from '@jsverse/transloco';

import {type BookQuerySortKey} from '../data/book-query-params';
import {type BookSummary} from '../data/book-response.models';
import {bookReadStatusLabelKey, formatMediumDate} from './book-browse-fields';

const EMPTY_VALUE = '—';

@Injectable({providedIn: 'root'})
export class BookBrowseSortLineService {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  lineFor(key: BookQuerySortKey, book: BookSummary): string {
    this.activeLang();
    const metadata = book.metadata;
    switch (key) {
      case 'addedOn':
        return this.date(book.addedOn);
      case 'lastReadTime':
        return this.date(book.lastReadTime);
      case 'dateFinished':
        return this.date(book.dateFinished);
      case 'publishedDate':
        return this.date(metadata?.publishedDate);
      case 'publisher':
        return this.text(metadata?.publisher);
      case 'seriesName':
        return this.text(metadata?.seriesName);
      case 'narrator':
        return this.text(metadata?.narrator);
      case 'language':
        return this.text(metadata?.language);
      case 'pageCount':
        return this.number(metadata?.pageCount);
      case 'personalRating':
        return this.rating(book.personalRating);
      case 'amazonRating':
      case 'goodreadsRating':
      case 'hardcoverRating':
      case 'ranobedbRating':
        return this.rating(metadata?.[key]);
      case 'amazonReviewCount':
      case 'goodreadsReviewCount':
      case 'hardcoverReviewCount':
        return this.number(metadata?.[key]);
      case 'readingProgress':
        return this.progress(book);
      case 'readStatus':
        return this.readStatus(book.readStatus);
      case 'title':
      case 'seriesNumber':
      case 'random':
        return EMPTY_VALUE;
    }
  }

  private date(value: string | undefined): string {
    return formatMediumDate(value) || EMPTY_VALUE;
  }

  private text(value: string | undefined): string {
    return value || EMPTY_VALUE;
  }

  private number(value: number | undefined): string {
    return value == null ? EMPTY_VALUE : new Intl.NumberFormat().format(value);
  }

  private rating(value: number | undefined): string {
    return value == null ? EMPTY_VALUE : value.toFixed(1);
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

  private readStatus(status: BookSummary['readStatus']): string {
    const labelKey = bookReadStatusLabelKey(status);
    return labelKey ? this.transloco.translate(labelKey) : EMPTY_VALUE;
  }
}
