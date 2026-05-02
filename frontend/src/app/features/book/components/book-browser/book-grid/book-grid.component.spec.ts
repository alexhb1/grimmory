import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {QueryClient} from '@tanstack/angular-query-experimental';
import {ConfirmationService, MessageService} from 'primeng/api';
import {Subject} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {AppSettingsService} from '../../../../../shared/service/app-settings.service';
import {RouteScrollPositionService} from '../../../../../shared/service/route-scroll-position.service';
import {UrlHelperService} from '../../../../../shared/service/url-helper.service';
import {UserService} from '../../../../settings/user-management/user.service';
import {EmailService} from '../../../../settings/email-v2/email.service';
import {BookFileService} from '../../../service/book-file.service';
import {BookMetadataManageService} from '../../../service/book-metadata-manage.service';
import {BookService} from '../../../service/book.service';
import {ReadStatusHelper} from '../../../helpers/read-status.helper';
import {BookNavigationService} from '../../../service/book-navigation.service';
import {Book} from '../../../model/book.model';
import {BookDialogHelperService} from '../book-dialog-helper.service';
import {BookCardOverlayPreferenceService} from '../book-card-overlay-preference.service';
import {BookSelectionService} from '../book-selection.service';
import {CoverScalePreferenceService} from '../cover-scale-preference.service';
import {BookGridComponent} from './book-grid.component';
import {getTranslocoModule} from '../../../../../core/testing/transloco-testing';

function makeBook(id: number): Book {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    metadata: {
      bookId: id,
      title: `Book ${id}`,
    },
  } as Book;
}

describe('BookGridComponent', () => {
  let fixture: ComponentFixture<BookGridComponent>;
  let component: BookGridComponent;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    });
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    TestBed.configureTestingModule({
      imports: [BookGridComponent, getTranslocoModule()],
      providers: [
        BookSelectionService,
        {provide: ActivatedRoute, useValue: {snapshot: {pathFromRoot: [], params: {}}}},
        {provide: Router, useValue: {events: new Subject<unknown>().asObservable()}},
        {
          provide: RouteScrollPositionService,
          useValue: {
            keyFor: vi.fn(() => 'grid-key'),
            getPosition: vi.fn(() => 0),
            trackRoute: vi.fn(),
          },
        },
        {
          provide: CoverScalePreferenceService,
          useValue: {
            scaleFactor: vi.fn(() => 1),
            setScale: vi.fn(),
          },
        },
        {
          provide: BookCardOverlayPreferenceService,
          useValue: {
            showBookTypePill: vi.fn(() => true),
          },
        },
        {
          provide: UrlHelperService,
          useValue: {
            getBookUrl: (book: Book) => `/book/${book.id}`,
            getThumbnailUrl: () => null,
            getAudiobookThumbnailUrl: () => null,
          },
        },
        {
          provide: UserService,
          useValue: {
            currentUser: vi.fn(() => null),
            getCurrentUser: vi.fn(() => null),
          },
        },
        {provide: BookService, useValue: {}},
        {provide: BookFileService, useValue: {}},
        {provide: BookMetadataManageService, useValue: {}},
        {provide: EmailService, useValue: {}},
        {provide: ConfirmationService, useValue: {confirm: vi.fn()}},
        {provide: MessageService, useValue: {add: vi.fn()}},
        {provide: BookDialogHelperService, useValue: {}},
        {provide: BookNavigationService, useValue: {}},
        {provide: AppSettingsService, useValue: {appSettings: vi.fn(() => null)}},
        {provide: QueryClient, useValue: {setQueriesData: vi.fn()}},
        {
          provide: ReadStatusHelper,
          useValue: {
            getReadStatusIcon: vi.fn(() => 'pi pi-book'),
            getReadStatusClass: vi.fn(() => 'status-reading'),
            getReadStatusTooltip: vi.fn(() => 'Reading'),
            shouldShowStatusIcon: vi.fn(() => true),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(BookGridComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('uses virtualRowCount for the virtualizer count', () => {
    fixture.componentRef.setInput('books', [makeBook(1), makeBook(2)]);
    fixture.componentRef.setInput('virtualRowCount', 12);
    fixture.detectChanges();

    expect(component.virtualGrid.virtualizer.options().count).toBe(12);
  });

  it('emits loadNextPage when the virtualizer nears the loaded rows', () => {
    const loadNextPageSpy = vi.fn();
    vi.spyOn(component.virtualGrid.virtualizer, 'getVirtualItems').mockReturnValue([
      {index: 2, key: 3, start: 0, end: 241, size: 241, lane: 0}
    ]);
    component.loadNextPage.subscribe(loadNextPageSpy);

    fixture.componentRef.setInput('books', [makeBook(1), makeBook(2), makeBook(3)]);
    fixture.componentRef.setInput('virtualRowCount', 4);
    fixture.componentRef.setInput('isFetchingNextPage', false);
    TestBed.flushEffects();

    expect(loadNextPageSpy).toHaveBeenCalledTimes(1);
  });

  it('renders loading skeleton cells through the virtualizer', () => {
    vi.spyOn(component.virtualGrid.virtualizer, 'getVirtualItems').mockReturnValue([
      {index: 0, key: 'loading-0', start: 0, end: 241, size: 241, lane: 0}
    ]);

    fixture.componentRef.setInput('books', []);
    fixture.componentRef.setInput('virtualRowCount', 24);
    fixture.componentRef.setInput('isLoading', true);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(component.virtualGrid.virtualizer.options().count).toBe(24);
    expect(host.querySelector('.virtual-loader-cell')).toBeTruthy();
  });
});
