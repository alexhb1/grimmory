import {computed, Component, DestroyRef, ErrorHandler, inject, OnInit, signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {ActivatedRoute, Router} from '@angular/router';
import {UserService} from '../../../settings/user-management/user.service';
import {Book, BookRecommendation} from '../../../book/model/book.model';
import {distinctUntilChanged, filter, map} from 'rxjs/operators';
import {BookService} from '../../../book/service/book.service';
import {AppSettingsService} from '../../../../shared/service/app-settings.service';
import {Tab, TabList, TabPanel, TabPanels, Tabs,} from '@openng/optimus-ui/tabs';
import {DynamicDialogConfig, DynamicDialogRef} from '@openng/optimus-ui/dynamicdialog';
import {Button} from '@openng/optimus-ui/button';
import {BookMetadataHostService} from '../../../../shared/service/book-metadata-host.service';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {MetadataViewerComponent} from './metadata-viewer/metadata-viewer.component';
import {MetadataEditorComponent} from './metadata-editor/metadata-editor.component';
import {MetadataSearcherComponent} from './metadata-searcher/metadata-searcher.component';
import {SidecarViewerComponent} from './sidecar-viewer/sidecar-viewer.component';
import {injectQuery, queryOptions} from '@tanstack/angular-query-experimental';
import {bookRecommendationsQueryKey} from '../../../book/service/book-query-keys';
import {PageTitleService} from '../../../../shared/service/page-title.service';

enum BookMetadataTab {
  View = 'view',
  Edit = 'edit',
  Match = 'match',
  Sidecar = 'sidecar',
}

export interface BookMetadataCenterDialogData {
  bookId: number;
}

@Component({
  selector: 'app-book-metadata-center',
  standalone: true,
  templateUrl: './book-metadata-center.component.html',
  imports: [
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    MetadataViewerComponent,
    MetadataEditorComponent,
    MetadataSearcherComponent,
    SidecarViewerComponent,
    Button,
    TranslocoDirective
  ],
  styleUrls: ['./book-metadata-center.component.scss'],
})
export class BookMetadataCenterComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private errorHandler = inject(ErrorHandler);
  private bookService = inject(BookService);
  private userService = inject(UserService);
  private appSettingsService = inject(AppSettingsService);
  private metadataHostService = inject(BookMetadataHostService);
  private destroyRef = inject(DestroyRef);
  private pageTitle = inject(PageTitleService);
  private t = inject(TranslocoService);
  readonly config = inject<DynamicDialogConfig<BookMetadataCenterDialogData> | null>(DynamicDialogConfig, {optional: true});
  readonly ref = inject(DynamicDialogRef, {optional: true});
  BookMetadataTab = BookMetadataTab;

  private currentBookId = signal<number | null>(this.config?.data?.bookId ?? null);
  private bookQuery = injectQuery(() => {
    const bookId = this.currentBookId();

    if (bookId == null) {
      return {
        queryKey: ['books', 'detail', -1, true] as const,
        queryFn: (): Book => {
          throw new Error('No book selected');
        },
        enabled: false,
      };
    }

    return this.bookService.bookDetailQueryOptions(bookId, true);
  });
  readonly book = computed(() => this.bookQuery.data() ?? null);
  private readonly recommendationsQuery = injectQuery(() => {
    const bookId = this.currentBookId();
    const settings = this.appSettingsService.appSettings();

    if (bookId == null || !(settings?.similarBookRecommendation ?? false)) {
      return queryOptions({
        queryKey: bookRecommendationsQueryKey(-1, 20),
        queryFn: (): BookRecommendation[] => [],
        enabled: false,
      });
    }

    return this.bookService.bookRecommendationsQueryOptions(bookId, 20);
  });
  readonly recommendedBooks = computed(() =>
    [...(this.recommendationsQuery.data() ?? [])].sort(
      (a, b) => (b.similarityScore ?? 0) - (a.similarityScore ?? 0)
    )
  );
  private _tab: BookMetadataTab = BookMetadataTab.View;
  readonly canEditMetadata = computed(() => {
    const user = this.userService.currentUser();
    return user?.permissions?.canEditMetadata ?? false;
  });
  readonly admin = computed(() => {
    const user = this.userService.currentUser();
    return user?.permissions?.admin ?? false;
  });
  get isPhysical(): boolean { return this.book()?.isPhysical ?? false; }
  readonly isLocalStorage = computed(() => this.appSettingsService.appSettings()?.diskType === 'LOCAL');
  get canShowSidecarTab(): boolean {
    const settings = this.appSettingsService.appSettings();
    const sidecarEnabled = settings?.metadataPersistenceSettings?.sidecarSettings?.enabled ?? false;

    return (this.admin() || this.canEditMetadata()) && !this.isPhysical && this.isLocalStorage() && sidecarEnabled;
  }
  private readonly validTabs: readonly string[] = Object.values(BookMetadataTab);

  get tab(): BookMetadataTab {
    return this._tab;
  }

  set tab(value: BookMetadataTab) {
    this._tab = value;

    if (!this.config) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab: value },
        queryParamsHandling: 'merge'
      }).catch((error: unknown) => this.errorHandler.handleError(error));
    }
  }

  ngOnInit(): void {
    if (!this.config) {
      this.pageTitle.setPageTitle(this.t.translate('metadata.center.title'));
    }
    const bookIdFromDialog: number | undefined = this.config?.data?.bookId;
    if (bookIdFromDialog != null) {
      this.currentBookId.set(bookIdFromDialog);
    } else {
      this.route.paramMap
        .pipe(
          map(params => Number(params.get('bookId'))),
          filter(bookId => !isNaN(bookId)),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe(bookId => this.currentBookId.set(bookId));
    }

    this.metadataHostService.bookSwitches$
      .pipe(
        filter((bookId): bookId is number => !!bookId),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(bookId => this.currentBookId.set(bookId));

    this.route.queryParamMap
      .pipe(
        map(params => params.get('tab')),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(tabParam => {
        if (this.isBookMetadataTab(tabParam) && this.canOpenTab(tabParam)) {
          this._tab = tabParam;
        } else {
          const defaultTab = BookMetadataTab.View;
          this._tab = defaultTab;
          if (!this.config) {
            this.router.navigate([], {
              relativeTo: this.route,
              queryParams: {tab: defaultTab},
              queryParamsHandling: 'merge',
              replaceUrl: true
            }).catch((error: unknown) => this.errorHandler.handleError(error));
          }
        }
      });

  }

  private isBookMetadataTab(value: string | null): value is BookMetadataTab {
    return value !== null && this.validTabs.includes(value);
  }

  protected canOpenTab(tab: BookMetadataTab): boolean {
    switch (tab) {
      case BookMetadataTab.View:
        return true;
      case BookMetadataTab.Edit:
      case BookMetadataTab.Match:
        return this.admin() || this.canEditMetadata();
      case BookMetadataTab.Sidecar:
        return this.canShowSidecarTab;
      default:
        return false;
    }
  }

}
