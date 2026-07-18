import {describe, expectTypeOf, it} from 'vitest';

import {
  BookAudiobookProgress,
  BookDetail,
  BookDetailAudiobookChapter,
  BookDetailAudiobookMetadata,
  BookDetailComicMetadata,
  BookDetailMetadata,
  BookFileResponse,
  BookLibraryPath,
  BookSummary,
  BookSummaryAudiobookMetadata,
  BookSummaryComicMetadata,
  BookSummaryMetadata,
} from './book-response.models';

type Lacks<T, Key extends PropertyKey> = Key extends keyof T ? false : true;
type HasNoIndexSignature<T> = string extends keyof T ? false : true;

describe('book response models', () => {
  it('keeps collection summaries separate from full book detail', () => {
    expectTypeOf<Lacks<BookSummary, 'fileName'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookSummary, 'filePath'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookSummary, 'seriesCount'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookSummary, 'seriesBooks'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookSummary, 'title'>>().toEqualTypeOf<true>();
    expectTypeOf<HasNoIndexSignature<BookSummary>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookSummaryMetadata, 'description'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookSummaryMetadata, 'titleLocked'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookSummaryMetadata, 'provider'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookSummaryMetadata, 'goodreadsId'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookSummaryAudiobookMetadata, 'chapters'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookSummaryComicMetadata, 'issueNumber'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookSummaryComicMetadata, 'charactersLocked'>>().toEqualTypeOf<true>();
    expectTypeOf<BookSummaryMetadata['allMetadataLocked']>().toEqualTypeOf<boolean>();
    expectTypeOf<BookSummaryMetadata['rating']>().toEqualTypeOf<number | undefined>();
  });

  it('models the full detail response without legacy-only fields', () => {
    expectTypeOf<BookDetailMetadata['description']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<BookDetailMetadata['hardcoverBookId']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<BookDetailMetadata['titleLocked']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<BookDetailAudiobookMetadata['chapters']>()
      .toEqualTypeOf<BookDetailAudiobookChapter[] | undefined>();
    expectTypeOf<BookDetailComicMetadata['storyArcNumberLocked']>()
      .toEqualTypeOf<boolean | undefined>();
    expectTypeOf<BookAudiobookProgress['trackPositionMs']>().toEqualTypeOf<number | null>();
    expectTypeOf<BookDetail['libraryPath']>().toEqualTypeOf<BookLibraryPath | undefined>();
    expectTypeOf<Lacks<BookDetail, 'fileName'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookDetail, 'filePath'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookDetail, 'seriesCount'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookDetail, 'seriesBooks'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookDetail, 'title'>>().toEqualTypeOf<true>();
    expectTypeOf<HasNoIndexSignature<BookDetail>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookDetailMetadata, 'allMetadataLocked'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookDetailMetadata, 'reviewCount'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookDetailMetadata, 'reviews'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookDetailMetadata, 'bookReviews'>>().toEqualTypeOf<true>();
  });

  it('uses the backend file shape rather than the legacy additional-file model', () => {
    expectTypeOf<BookFileResponse['book']>().toEqualTypeOf<boolean>();
    expectTypeOf<Lacks<BookFileResponse, 'isBook'>>().toEqualTypeOf<true>();
    expectTypeOf<Lacks<BookFileResponse, 'additionalFileType'>>().toEqualTypeOf<true>();
  });

});
