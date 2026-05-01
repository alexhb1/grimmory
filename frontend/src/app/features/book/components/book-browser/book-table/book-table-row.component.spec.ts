import {ComponentFixture, TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {beforeEach, describe, expect, it} from 'vitest';

import {getTranslocoModule} from '../../../../../core/testing/transloco-testing';
import {UrlHelperService} from '../../../../../shared/service/url-helper.service';
import {Book, ReadStatus} from '../../../model/book.model';
import {ReadStatusHelper} from '../../../helpers/read-status.helper';
import {BookTableRowComponent} from './book-table-row.component';

function makeBook(id: number, title: string): Book {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    metadata: {
      bookId: id,
      title,
      authors: ['Test Author'],
      categories: ['Fantasy'],
      amazonRating: 4.2,
      allMetadataLocked: false,
    },
    readStatus: ReadStatus.READING,
    fileSizeKb: 1536,
    primaryFile: {
      id: id * 10,
      bookId: id,
      bookType: 'EPUB',
      fileName: `${title}.epub`,
    },
  };
}

describe('BookTableRowComponent', () => {
  let fixture: ComponentFixture<BookTableRowComponent>;
  let component: BookTableRowComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BookTableRowComponent, getTranslocoModule()],
      providers: [
        provideRouter([]),
        {
          provide: UrlHelperService,
          useValue: {
            getBookUrl: (book: Book) => `/book/${book.id}`,
            filterBooksBy: (filterKey: string, filterValue: string) => `/all-books?filter=${filterKey}:${filterValue}`,
            getThumbnailUrl: () => null,
            getAudiobookThumbnailUrl: () => null,
          },
        },
        {
          provide: ReadStatusHelper,
          useValue: {
            getReadStatusIcon: () => 'pi pi-book',
            getReadStatusClass: () => 'status-reading',
            getReadStatusTooltip: () => 'Reading',
            shouldShowStatusIcon: () => true,
          },
        },
      ],
    });

    fixture = TestBed.createComponent(BookTableRowComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('rowIndex', 0);
    fixture.componentRef.setInput('rowHeight', 46);
    fixture.componentRef.setInput('rowStart', 0);
    fixture.componentRef.setInput('isSelected', false);
    fixture.componentRef.setInput('useSquareCovers', false);
  });

  it('renders visible book fields as table cells', () => {
    fixture.componentRef.setInput('book', makeBook(1, 'Alpha'));
    fixture.componentRef.setInput('cellIds', ['title', 'authors', 'amazonRating', 'fileSizeKb']);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const cells = host.querySelectorAll<HTMLElement>('.book-table-cell');
    const links = host.querySelectorAll<HTMLAnchorElement>('.cell-link');
    const rating = host.querySelector<HTMLElement>('.rating-wrapper');

    expect(cells).toHaveLength(4);
    expect(links[0]?.textContent?.trim()).toBe('Alpha');
    expect(links[0]?.getAttribute('href')).toBe('/book/1');
    expect(links[1]?.textContent?.trim()).toBe('Test Author');
    expect(rating?.textContent).toContain('(4.2)');
    expect(cells[3]?.textContent?.trim()).toBe('1.5 MB');
  });

  it('uses empty metadata for books without metadata instead of treating them as loading', () => {
    fixture.componentRef.setInput('book', {...makeBook(1, 'Alpha'), metadata: undefined});
    fixture.componentRef.setInput('cellIds', ['title']);
    fixture.detectChanges();

    expect(component.metadata().bookId).toBe(1);
    expect(component.cells()[0]).toEqual(expect.objectContaining({id: 'title', kind: 'clickable', title: ''}));
  });
});
