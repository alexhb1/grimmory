import {afterEach, describe, expect, it, vi} from 'vitest';

import {
  decodeBookBatch,
  decodeBookDetail,
  decodeBookFacetGroups,
  decodeBookIds,
  decodeBookPage,
  decodeBookRecommendations,
} from './book-query-response-decoder';

describe('book query response decoder', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps a validated summary as the backend supplied it', () => {
    const book = {
      id: 7,
      libraryId: 2,
      libraryName: 'Library',
      metadata: {
        bookId: 7,
        title: 'Dune',
        allMetadataLocked: false,
        futureBackendField: 'preserved',
      },
    };

    const decoded = decodeBookPage({
      content: [book],
      page: {number: 0, size: 20, totalElements: 1, totalPages: 1},
      links: [],
    });

    expect(decoded.content[0]).toBe(book);
  });

  it('drops a malformed book from a page and keeps the valid ones', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const book = {
      id: 7,
      libraryId: 2,
      libraryName: 'Library',
    };

    const decoded = decodeBookPage({
      content: [book, {id: 'malformed'}],
      page: {number: 0, size: 20, totalElements: 2, totalPages: 1},
      links: [],
    });

    expect(decoded.content).toEqual([book]);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('rejects a page where every book fails validation', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => decodeBookPage({
      content: [{id: 'malformed'}],
      page: {number: 0, size: 20, totalElements: 1, totalPages: 1},
      links: [],
    })).toThrow(/page\.content/);
  });

  it('requires the complete authoritative page metadata envelope', () => {
    expect(() => decodeBookPage({
      content: [],
      page: {number: 0, size: 20, totalElements: 0},
      links: [],
    })).toThrow(/page\.page\.totalPages/);
  });

  it('requires summary-only metadata contract fields', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => decodeBookPage({
      content: [{id: 1, libraryId: 1, libraryName: 'Library', metadata: {bookId: 1}}],
      page: {number: 0, size: 20, totalElements: 1, totalPages: 1},
      links: [],
    })).toThrow(/page\.content/);
    expect(warnSpy).toHaveBeenCalledWith(
      '[BookQuery] Dropped malformed book from page response',
      expect.objectContaining({message: expect.stringMatching(/page\.content\[0\]\.metadata\.allMetadataLocked/)}),
    );
  });

  it('rejects malformed facet groups', () => {
    expect(() => decodeBookFacetGroups({
      links: [{rel: 'self', href: '/api/v1/books/facets', type: 'application/json'}],
      facets: [{
        metadata: {rel: 'facet', key: 'genre', title: 'Genre'},
        links: [{
          rel: 'facet',
          href: '/api/v1/books/page',
          type: 'application/json',
          title: 'Fantasy',
          value: 'Fantasy',
          properties: {numberOfItems: 'four'},
        }],
      }],
    })).toThrow(/facets\.facets\[0\]\.links\[0\]\.properties\.numberOfItems/);
  });

  it('rejects duplicate book IDs in an ID list', () => {
    expect(() => decodeBookIds([3, 3])).toThrow(/ids\[1\]/);
  });

  it('rejects detail data that does not belong to the requested book', () => {
    expect(() => decodeBookDetail({
      id: 42,
      libraryId: 1,
      libraryName: 'Library',
      metadata: {bookId: 41},
    }, 42)).toThrow(/detail\.metadata\.bookId/);
  });

  it('rejects malformed nested detail state', () => {
    expect(() => decodeBookDetail({
      id: 42,
      libraryId: 1,
      libraryName: 'Library',
      shelves: [{
        name: 'Reading',
        publicShelf: false,
        bookCount: 1,
        sort: {field: null, direction: 'SIDEWAYS'},
      }],
    }, 42)).toThrow(/detail\.shelves\[0\]\.sort\.direction/);
  });

  it('rejects batch responses containing an unrequested book ID', () => {
    expect(() => decodeBookBatch([
      {id: 3, libraryId: 1, libraryName: 'Library'},
      {id: 7, libraryId: 1, libraryName: 'Library'},
    ], [3, 9])).toThrow(/batch\[1\]\.id/);
  });

  it('accepts the requested books the backend can still return from a batch', () => {
    const book = {id: 9, libraryId: 1, libraryName: 'Library'};

    expect(decodeBookBatch([book], [3, 9])).toEqual([book]);
  });

  it('rejects invalid recommendation identities and similarity scores', () => {
    const book = {id: 42, libraryId: 1, libraryName: 'Library'};

    expect(() => decodeBookRecommendations([
      {book, similarityScore: 0.5},
    ], 42)).toThrow(/recommendations\[0\]\.book\.id/);
    expect(() => decodeBookRecommendations([
      {book: {id: 7, libraryId: 1, libraryName: 'Library'}, similarityScore: 'close'},
    ], 42)).toThrow(/recommendations\[0\]\.similarityScore/);
  });

  it('accepts the representative nested detail contract without projecting it', () => {
    const book = {
      id: 7,
      libraryId: 2,
      libraryName: 'Library',
      primaryFile: {
        id: 70,
        bookId: 7,
        book: true,
        folderBased: false,
        bookType: 'EPUB',
        archiveType: 'ZIP',
      },
      alternativeFormats: [{id: 71, bookId: 7, book: false, folderBased: false}],
      supplementaryFiles: [{id: 72, bookId: 7, book: false, folderBased: false}],
      shelves: [{
        id: 4,
        name: 'Favourites',
        publicShelf: false,
        bookCount: 1,
        sort: {field: null, direction: 'ASCENDING'},
      }],
      pdfProgress: {page: null, percentage: 25},
      epubProgress: {
        cfi: null,
        href: 'chapter-1.xhtml',
        contentSourceProgressPercent: 20,
        percentage: 25,
        ttsPositionCfi: null,
      },
      cbxProgress: {page: 3, percentage: null},
      audiobookProgress: {
        positionMs: 1_000,
        trackIndex: 1,
        trackPositionMs: null,
        percentage: 10,
      },
      koreaderProgress: {percentage: 30},
      koboProgress: {percentage: null},
      metadata: {
        bookId: 7,
        title: 'Dune',
        provider: 'Hardcover',
        titleLocked: true,
        audiobookMetadata: {
          durationSeconds: 300,
          codec: 'AAC',
          chapters: [{index: 0, title: 'Opening', startTimeMs: 0, endTimeMs: 1_000}],
        },
        comicMetadata: {
          pencillers: ['Artist'],
          issueNumber: '1',
          volumeNumber: 2,
          manga: false,
          charactersLocked: true,
        },
      },
      libraryPath: {id: 5},
      futureBackendField: {preserved: true},
    };

    const decoded = decodeBookDetail(book, 7);

    expect(decoded).toBe(book);
  });

  it('keeps enum-like strings the frontend does not recognize yet', () => {
    const book = {
      id: 7,
      libraryId: 2,
      libraryName: 'Library',
      readStatus: 'FUTURE_STATUS',
      primaryFile: {
        id: 70,
        bookId: 7,
        book: true,
        folderBased: false,
        bookType: 'DJVU',
        archiveType: 'TAR',
      },
      shelves: [{
        id: 4,
        name: 'Favourites',
        icon: 'sparkle',
        iconType: 'EMOJI',
        publicShelf: false,
        bookCount: 1,
      }],
      metadata: {
        bookId: 7,
        provider: 'FutureSource',
      },
    };

    expect(decodeBookDetail(book, 7)).toBe(book);
  });

  it('rejects enum-like fields that are not strings', () => {
    expect(() => decodeBookDetail({
      id: 7,
      libraryId: 2,
      libraryName: 'Library',
      readStatus: 7,
    }, 7)).toThrow(/detail\.readStatus/);
  });
});
