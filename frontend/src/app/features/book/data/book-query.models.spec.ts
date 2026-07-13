import {InfiniteData} from '@tanstack/angular-query-experimental';
import {describe, expect, it} from 'vitest';

import {
  BookPage,
  decodeFacetGroups,
  findPageLink,
  flattenBookPages,
  totalBooks,
} from './book-query.models';
import {BookSummary} from './book-response.models';

function page(content: BookSummary[], totalElements = content.length): BookPage {
  return {
    content,
    page: {number: 0, size: 20, totalElements, totalPages: 1},
    links: [],
  };
}

describe('book query models', () => {
  it('finds page links by an array rel', () => {
    const response = page([]);
    response.links = [
      {rel: ['self'], href: '/api/v1/books/page', type: 'application/json'},
      {rel: ['next', 'collection'], href: '/api/v1/books/page?cursor=next', type: 'application/json'},
    ];

    expect(findPageLink(response, 'next')?.href).toBe('/api/v1/books/page?cursor=next');
    expect(findPageLink(response, 'previous')).toBeUndefined();
  });

  it('decodes facet groups and optional counts', () => {
    expect(decodeFacetGroups({
      facets: [{
        metadata: {rel: 'facet', key: 'genre', title: 'Genre'},
        links: [
          {
            rel: 'facet',
            href: '/api/v1/books/page?facet=genre%3AFantasy',
            type: 'application/json',
            title: 'Fantasy',
            value: 'Fantasy',
            properties: {numberOfItems: 12},
          },
          {
            rel: 'facet',
            href: '/api/v1/books/page?facet=genre%3AHorror',
            type: 'application/json',
            title: 'Horror',
            value: 'Horror',
          },
        ],
      }],
    })).toEqual([{
      rel: 'facet',
      key: 'genre',
      title: 'Genre',
      values: [
        {value: 'Fantasy', title: 'Fantasy', count: 12},
        {value: 'Horror', title: 'Horror'},
      ],
    }]);
  });

  it('flattens loaded summary pages and reads the first-page total', () => {
    const data: InfiniteData<BookPage, string | null> = {
      pages: [
        page([{id: 1, libraryId: 2, libraryName: 'Library'}], 3),
        page([{id: 2, libraryId: 2, libraryName: 'Library'}], 3),
      ],
      pageParams: [null, '/api/v1/books/page?cursor=next'],
    };

    expect(flattenBookPages(data).map(book => book.id)).toEqual([1, 2]);
    expect(totalBooks(data)).toBe(3);
    expect(flattenBookPages(undefined)).toEqual([]);
    expect(totalBooks(undefined)).toBe(0);
  });
});
