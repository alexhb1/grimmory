import {ageRatingRanges, BookFilters, BookFilterValue, fileSizeRanges, matchScoreRanges, pageCountRanges, ratingRanges} from '../book-filter/book-filter.config';
import {Book, ReadStatus} from '../../../model/book.model';
import {BookFilterMode} from '../../../../settings/user-management/user.service';

export function isRatingInRange(rating: number | undefined | null, rangeId: string | number): boolean {
  if (rating == null) return false;
  const numericId = typeof rangeId === 'string' ? Number(rangeId) : rangeId;
  const range = ratingRanges.find(r => r.id === numericId);
  if (!range) return false;
  return rating >= range.min && rating < range.max;
}

export function isRatingInRange10(rating: number | undefined | null, rangeId: string | number): boolean {
  if (rating == null) return false;
  const numericId = typeof rangeId === 'string' ? Number(rangeId) : rangeId;
  return Math.round(rating) === numericId;
}

export function isFileSizeInRange(fileSizeKb: number | undefined, rangeId: string | number): boolean {
  if (fileSizeKb == null) return false;
  const numericId = typeof rangeId === 'string' ? Number(rangeId) : rangeId;
  const range = fileSizeRanges.find(r => r.id === numericId);
  if (!range) return false;
  return fileSizeKb >= range.min && fileSizeKb < range.max;
}

export function isPageCountInRange(pageCount: number | undefined, rangeId: string | number): boolean {
  if (pageCount == null) return false;
  const numericId = typeof rangeId === 'string' ? Number(rangeId) : rangeId;
  const range = pageCountRanges.find(r => r.id === numericId);
  if (!range) return false;
  return pageCount >= range.min && pageCount < range.max;
}

export function isMatchScoreInRange(score: number | undefined | null, rangeId: string | number): boolean {
  if (score == null) return false;
  const normalizedScore = score > 1 ? score / 100 : score;
  const numericId = typeof rangeId === 'string' ? Number(rangeId) : rangeId;
  const range = matchScoreRanges.find(r => r.id === numericId);
  if (!range) return false;
  return normalizedScore >= range.min && normalizedScore < range.max;
}

export function isAgeRatingInRange(ageRating: number | undefined | null, rangeId: string | number): boolean {
  if (ageRating == null) return false;
  const numericId = typeof rangeId === 'string' ? Number(rangeId) : rangeId;
  const range = ageRatingRanges.find(r => r.id === numericId);
  if (!range) return false;
  return ageRating >= range.min && ageRating < range.max;
}

export function doesBookMatchReadStatus(book: Book, selected: BookFilterValue[]): boolean {
  const status = book.readStatus ?? ReadStatus.UNSET;
  return selected.includes(status);
}

function stringFilterValues(values: BookFilterValue[]): string[] {
  return values.filter((value): value is string => typeof value === 'string');
}

function matchesNumericValue(value: BookFilterValue, expected: number): boolean {
  return typeof value === 'number' ? value === expected : Number(value) === expected;
}

export function doesBookMatchFilter(
  book: Book,
  filterType: string,
  filterValues: BookFilterValue[],
  mode: BookFilterMode
): boolean {
  if (filterValues.length === 0) {
    return mode === 'or';
  }

  const effectiveMode = mode === 'not' ? 'or' : mode;
  const stringValues = stringFilterValues(filterValues);

  switch (filterType) {
    case 'author':
      return effectiveMode === 'or'
        ? stringValues.some(val => book.metadata?.authors?.includes(val))
        : stringValues.length === filterValues.length && stringValues.every(val => book.metadata?.authors?.includes(val));
    case 'category':
      return effectiveMode === 'or'
        ? stringValues.some(val => book.metadata?.categories?.includes(val))
        : stringValues.length === filterValues.length && stringValues.every(val => book.metadata?.categories?.includes(val));
    case 'series':
      return effectiveMode === 'or'
        ? stringValues.some(val => book.metadata?.seriesName?.trim() === val)
        : stringValues.length === filterValues.length && stringValues.every(val => book.metadata?.seriesName?.trim() === val);
    case 'bookType': {
      const bookType = book.isPhysical ? 'PHYSICAL' : book.primaryFile?.bookType;
      return bookType !== undefined && filterValues.includes(bookType);
    }
    case 'readStatus':
      return doesBookMatchReadStatus(book, filterValues);
    case 'personalRating':
      return filterValues.some(range => isRatingInRange10(book.personalRating, range));
    case 'publisher':
      return effectiveMode === 'or'
        ? stringValues.some(val => book.metadata?.publisher === val)
        : stringValues.length === filterValues.length && stringValues.every(val => book.metadata?.publisher === val);
    case 'matchScore':
      return filterValues.some(range => isMatchScoreInRange(book.metadataMatchScore, range));
    case 'library':
      return effectiveMode === 'or'
        ? filterValues.some(val => matchesNumericValue(val, book.libraryId))
        : filterValues.every(val => matchesNumericValue(val, book.libraryId));
    case 'shelf':
      return effectiveMode === 'or'
        ? filterValues.some(val => book.shelves?.some(s => s.id !== undefined && matchesNumericValue(val, s.id)))
        : filterValues.every(val => book.shelves?.some(s => s.id !== undefined && matchesNumericValue(val, s.id)));
    case 'shelfStatus': {
      const shelved = book.shelves && book.shelves.length > 0 ? 'shelved' : 'unshelved';
      return filterValues.includes(shelved);
    }
    case 'tag':
      return effectiveMode === 'or'
        ? stringValues.some(val => book.metadata?.tags?.includes(val))
        : stringValues.length === filterValues.length && stringValues.every(val => book.metadata?.tags?.includes(val));
    case 'publishedDate': {
      const bookYear = book.metadata?.publishedDate
        ? new Date(book.metadata.publishedDate).getFullYear()
        : null;
      return bookYear ? filterValues.some(val => matchesNumericValue(val, bookYear)) : false;
    }
    case 'fileSize':
      return filterValues.some(range => isFileSizeInRange(book.fileSizeKb, range));
    case 'amazonRating':
      return filterValues.some(range => isRatingInRange(book.metadata?.amazonRating, range));
    case 'goodreadsRating':
      return filterValues.some(range => isRatingInRange(book.metadata?.goodreadsRating, range));
    case 'hardcoverRating':
      return filterValues.some(range => isRatingInRange(book.metadata?.hardcoverRating, range));
    case 'lubimyczytacRating':
      return filterValues.some(range => isRatingInRange(book.metadata?.lubimyczytacRating, range));
    case 'ranobedbRating':
      return filterValues.some(range => isRatingInRange(book.metadata?.ranobedbRating, range));
    case 'audibleRating':
      return filterValues.some(range => isRatingInRange(book.metadata?.audibleRating, range));
    case 'language': {
      const language = book.metadata?.language;
      return language !== undefined && filterValues.includes(language);
    }
    case 'pageCount':
      return filterValues.some(range => isPageCountInRange(book.metadata?.pageCount ?? undefined, range));
    case 'mood':
      return effectiveMode === 'or'
        ? stringValues.some(val => book.metadata?.moods?.includes(val))
        : stringValues.length === filterValues.length && stringValues.every(val => book.metadata?.moods?.includes(val));
    case 'ageRating':
      return filterValues.some(range => isAgeRatingInRange(book.metadata?.ageRating, range));
    case 'contentRating': {
      const contentRating = book.metadata?.contentRating;
      return contentRating != null && filterValues.includes(contentRating);
    }
    case 'narrator': {
      const narrator = book.metadata?.narrator;
      return narrator !== undefined && filterValues.includes(narrator);
    }
    case 'comicCharacter':
      return effectiveMode === 'or'
        ? stringValues.some(val => book.metadata?.comicMetadata?.characters?.includes(val))
        : stringValues.length === filterValues.length && stringValues.every(val => book.metadata?.comicMetadata?.characters?.includes(val));
    case 'comicTeam':
      return effectiveMode === 'or'
        ? stringValues.some(val => book.metadata?.comicMetadata?.teams?.includes(val))
        : stringValues.length === filterValues.length && stringValues.every(val => book.metadata?.comicMetadata?.teams?.includes(val));
    case 'comicLocation':
      return effectiveMode === 'or'
        ? stringValues.some(val => book.metadata?.comicMetadata?.locations?.includes(val))
        : stringValues.length === filterValues.length && stringValues.every(val => book.metadata?.comicMetadata?.locations?.includes(val));
    case 'comicCreator': {
      const comic = book.metadata?.comicMetadata;
      if (!comic) return false;
      const allCreators: string[] = [];
      const roles: [string[] | undefined, string][] = [
        [comic.pencillers, 'penciller'],
        [comic.inkers, 'inker'],
        [comic.colorists, 'colorist'],
        [comic.letterers, 'letterer'],
        [comic.coverArtists, 'coverArtist'],
        [comic.editors, 'editor']
      ];
      for (const [names, role] of roles) {
        if (names) {
          for (const name of names) {
            allCreators.push(`${name}:${role}`);
          }
        }
      }
      return effectiveMode === 'or'
        ? stringValues.some(val => allCreators.includes(val))
        : stringValues.length === filterValues.length && stringValues.every(val => allCreators.includes(val));
    }
    default:
      return false;
  }
}

export function filterBooksByFilters(
  books: Book[],
  activeFilters: BookFilters | null,
  mode: BookFilterMode,
  excludeFilterType?: string
): Book[] {
  if (!activeFilters) return books;

  const filterEntries = Object.entries(activeFilters)
    .filter(([type]) => type !== excludeFilterType);

  if (filterEntries.length === 0) return books;

  return books.filter(book => matchesAllFilters(book, filterEntries, mode));
}

function matchesAllFilters(
  book: Book,
  filterEntries: [string, BookFilterValue[]][],
  mode: BookFilterMode
): boolean {
  if (mode === 'or') {
    for (const [filterType, filterValues] of filterEntries) {
      if (doesBookMatchFilter(book, filterType, filterValues, mode)) {
        return true;
      }
    }

    return false;
  }

  if (mode === 'not') {
    for (const [filterType, filterValues] of filterEntries) {
      if (doesBookMatchFilter(book, filterType, filterValues, mode)) {
        return false;
      }
    }

    return true;
  }

  for (const [filterType, filterValues] of filterEntries) {
    if (!doesBookMatchFilter(book, filterType, filterValues, mode)) {
      return false;
    }
  }

  return true;
}
