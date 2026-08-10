import {ComponentFixture, TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {beforeEach, describe, expect, it} from 'vitest';

import {getTranslocoModule} from '../../../../core/testing/transloco-testing';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {BookSummary} from '../../data/book-response.models';
import {BookCardComponent, bookCardCoverSrc} from './book-card.component';

function makeBook(overrides: Partial<BookSummary> = {}): BookSummary {
  return {
    id: 1,
    libraryId: 1,
    libraryName: 'Library',
    metadata: {
      bookId: 1,
      title: 'The Warden',
      authors: ['Anthony Trollope'],
      allMetadataLocked: false,
    },
    primaryFile: {id: 10, bookId: 1, book: true, folderBased: false, bookType: 'EPUB'},
    ...overrides,
  };
}

function audiobookFile() {
  return {id: 10, bookId: 1, book: true, folderBased: false, bookType: 'AUDIOBOOK' as const};
}

describe('book card progress precedence', () => {
  let fixture: ComponentFixture<BookCardComponent>;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BookCardComponent, getTranslocoModule()],
      providers: [
        provideRouter([{path: '**', children: []}]),
        {
          provide: UrlHelperService,
          useValue: {
            getThumbnailUrl: (id: number) => `/thumb/${id}`,
            getAudiobookThumbnailUrl: (id: number) => `/audio-thumb/${id}`,
          },
        },
      ],
    });

    fixture = TestBed.createComponent(BookCardComponent);
    host = fixture.nativeElement as HTMLElement;
  });

  function progressWidth(book: BookSummary): string | undefined {
    fixture.componentRef.setInput('book', book);
    fixture.detectChanges();
    return host.querySelector<HTMLElement>('[data-testid="progress"] i')?.style.width;
  }

  it('prefers Grimmory progress, then KOReader, then Kobo', () => {
    expect(progressWidth(makeBook({
      epubProgress: {cfi: null, href: null, contentSourceProgressPercent: null, percentage: 30, ttsPositionCfi: null},
      pdfProgress: {page: 1, percentage: 50},
      cbxProgress: {page: 1, percentage: 70},
      koreaderProgress: {percentage: 42},
    }))).toBe('30%');
    expect(progressWidth(makeBook({
      audiobookProgress: {positionMs: 1000, trackIndex: null, trackPositionMs: null, percentage: 82},
    }))).toBe('82%');
    expect(progressWidth(makeBook({koreaderProgress: {percentage: 42}, koboProgress: {percentage: 12}}))).toBe('42%');
    expect(progressWidth(makeBook({koboProgress: {percentage: 12}}))).toBe('12%');
    expect(progressWidth(makeBook())).toBeUndefined();
  });
});

describe('bookCardCoverSrc', () => {
  const urlHelper = {
    getThumbnailUrl: (id: number) => `/thumb/${id}`,
    getAudiobookThumbnailUrl: (id: number) => `/audio-thumb/${id}`,
  } as UrlHelperService;

  it('picks audiobook artwork for audiobook primaries, and in square grids with an audiobook format', () => {
    expect(bookCardCoverSrc(makeBook(), false, urlHelper)).toBe('/thumb/1');

    const audiobook = makeBook({primaryFile: audiobookFile()});
    expect(bookCardCoverSrc(audiobook, false, urlHelper)).toBe('/audio-thumb/1');

    const dual = makeBook({alternativeFormats: [{id: 12, bookId: 1, book: true, folderBased: false, bookType: 'AUDIOBOOK'}]});
    expect(bookCardCoverSrc(dual, false, urlHelper)).toBe('/thumb/1');
    expect(bookCardCoverSrc(dual, true, urlHelper)).toBe('/audio-thumb/1');
  });
});
