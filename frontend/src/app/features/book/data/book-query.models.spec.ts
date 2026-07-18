import {InfiniteData} from '@tanstack/angular-query-experimental';
import {describe, expect, it} from 'vitest';

import {
  BookPage,
  flattenBookPages,
} from './book-query.models';
import {BookSummary} from './book-response.models';

function page(content: BookSummary[], totalElements = content.length): BookPage {
  return {
    content,
    page: {
      number: 0,
      size: 20,
      totalElements,
      totalPages: totalElements === 0 ? 0 : 1,
    },
    links: [],
  };
}

describe('book query models', () => {
  it('flattens only the pages currently loaded by the cursor query', () => {
    const data: InfiniteData<BookPage> = {
      pages: [
        page([{id: 1, libraryId: 2, libraryName: 'Library'}], 3),
        page([{id: 2, libraryId: 2, libraryName: 'Library'}], 3),
      ],
      pageParams: [null, '/api/v1/books/page?cursor=next'],
    };

    expect(flattenBookPages(data).map(book => book.id)).toEqual([1, 2]);
    expect(flattenBookPages(undefined)).toEqual([]);
  });
});
