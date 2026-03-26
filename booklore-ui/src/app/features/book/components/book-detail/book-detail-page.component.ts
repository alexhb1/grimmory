import {
  afterNextRender, Component, computed, DestroyRef, effect, ElementRef,
  inject, OnInit, signal, viewChild
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { MenuItem } from 'primeng/api';
import { TieredMenu } from 'primeng/tieredmenu';
import { Menu } from 'primeng/menu';
import DOMPurify from 'dompurify';
import { injectQuery } from '@tanstack/angular-query-experimental';

import { Book, ComicMetadata, FileInfo, ReadStatus } from '../../model/book.model';
import { BookService } from '../../service/book.service';
import { BookFileService } from '../../service/book-file.service';
import { BookNavigationService } from '../../service/book-navigation.service';
import { UrlHelperService } from '../../../../shared/service/url-helper.service';
import { UserService } from '../../../settings/user-management/user.service';
import { AppSettingsService } from '../../../../shared/service/app-settings.service';
import { TaskHelperService } from '../../../settings/task-management/task-helper.service';
import { MetadataRefreshType } from '../../../metadata/model/request/metadata-refresh-type.enum';
import { ResetProgressType, ResetProgressTypes } from '../../../../shared/constants/reset-progress-type';
import { AGE_RATING_OPTIONS, CONTENT_RATING_LABELS } from '../book-browser/book-filter/book-filter.config';
import { LibraryService } from '../../service/library.service';
import { EmailService } from '../../../settings/email-v2/email.service';

import { BookToolbarComponent } from '../../../../shared/components/ui/book-toolbar/book-toolbar';
import { CoverPlaceholderComponent } from '../../../../shared/components/cover-generator/cover-generator.component';
import { AccordionComponent, AccordionPanelComponent } from '../../../../shared/components/ui/accordion/accordion';
import { ButtonComponent } from '../../../../shared/components/ui/button/button';
import { TagComponent } from '../../../../shared/components/ui/tag/tag';
import { RatingComponent } from '../../../../shared/components/ui/rating/rating';
import { TabsComponent, TabListComponent, TabComponent, TabPanelComponent } from '../../../../shared/components/ui/tabs/tabs';
import { SplitButtonComponent } from '../../../../shared/components/ui/split-button/split-button';
import { ToastService } from '../../../../shared/components/ui/toast/toast.service';
import { PopupMenuService } from '../../../../shared/components/ui/services/popup-menu.service';

type DetailFieldTone = 'default' | 'accent';
type DetailBadgeTone = 'accent' | 'success' | 'info' | 'warn' | 'danger';

interface DetailField {
  label: string;
  value: string;
  tone?: DetailFieldTone;
  badgeTone?: DetailBadgeTone;
  clickFilter?: { key: string; value: string };
  routerLink?: any[];
  externalUrl?: string;
  action?: 'editStatus' | 'resetProgress' | 'resetKoreader' | 'resetKobo';
}

const FORMAT_LABELS: Record<string, string> = {
  PDF: 'PDF', EPUB: 'EPUB', CBX: 'CBX', FB2: 'FB2',
  MOBI: 'MOBI', AZW3: 'AZW3', AUDIOBOOK: 'Audiobook',
};

@Component({
  selector: 'app-book-detail-page',
  standalone: true,
  imports: [
    RouterLink, AccordionComponent, AccordionPanelComponent,
    ButtonComponent, BookToolbarComponent, TagComponent, RatingComponent,
    TabsComponent, TabListComponent, TabComponent, TabPanelComponent,
    SplitButtonComponent, TieredMenu, Menu, CoverPlaceholderComponent
  ],
  template: `
    @if (book(); as book) {
      <div class="px-8 py-8">
        <app-book-toolbar
          [current]="navPosition()?.current ?? 0"
          [total]="navPosition()?.total ?? 0"
          [prev]="navService.previousBookId()"
          [next]="navService.nextBookId()"
        />

        <div class="mx-auto mt-6 max-w-[1100px]">
          <!-- Hero: Cover + Core Info -->
          <div class="flex gap-8">

            <!-- Cover -->
            <div class="flex-shrink-0">
              @if (coverUrl(); as url) {
                <img
                  [src]="url"
                  [alt]="book.metadata?.title ?? 'Book cover'"
                  class="w-[225px] aspect-[2/3] rounded-[7px] overflow-hidden object-cover cursor-pointer"
                  style="box-shadow: 0 10px 30px rgba(0,0,0,0.4), 0 4px 10px rgba(0,0,0,0.25);"
                />
              } @else {
                <div
                  class="w-[225px] aspect-[2/3] rounded-[7px] overflow-hidden cover-depth cover-spine cursor-pointer relative"
                  style="box-shadow: 0 10px 30px rgba(0,0,0,0.4), 0 4px 10px rgba(0,0,0,0.25);"
                >
                  <app-cover-placeholder [title]="book.metadata?.title ?? ''" [author]="authors()" size="lg" />
                </div>
              }
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0 pt-1 flex flex-col">

              <!-- Series link -->
              @if (book.metadata?.seriesName) {
                <a class="text-xs text-accent-text hover:underline cursor-pointer"
                   [routerLink]="['/series', book.metadata!.seriesName]">
                  {{ book.metadata!.seriesName }}
                  @if (book.metadata!.seriesNumber != null) {
                    — Book {{ book.metadata!.seriesNumber }}
                    @if (book.metadata!.seriesTotal != null) {
                      of {{ book.metadata!.seriesTotal }}
                    }
                  }
                </a>
              }

              <!-- Title -->
              <h1 class="font-heading text-3xl font-semibold text-ink tracking-tight leading-tight mt-1">
                {{ book.metadata?.title }}@if (book.metadata?.subtitle) {: {{ book.metadata!.subtitle }}}
              </h1>

              <!-- Author -->
              <p class="text-lg text-ink-light mt-1">
                @for (author of book.metadata?.authors ?? []; track author; let isLast = $last) {
                  <a class="hover:text-accent-text cursor-pointer transition-colors"
                     [routerLink]="['/all-books']"
                     [queryParams]="{ filter: 'author:' + author }">{{ author }}</a>@if (!isLast) {, }
                }
              </p>

              <!-- Meta row -->
              <div class="flex items-center gap-4 mt-3 flex-wrap text-sm text-ink-muted">
                @if (book.metadata?.publishedDate) {
                  <a class="hover:text-accent-text cursor-pointer transition-colors"
                     [routerLink]="['/all-books']"
                     [queryParams]="{ filter: 'publishedDate:' + extractYear(book.metadata!.publishedDate) }">
                    {{ book.metadata!.publishedDate }}
                  </a>
                }
                <app-rating [value]="book.personalRating ?? 0" [expandable]="true"
                            (valueChange)="onPersonalRatingChange(book, $event)" />
                @if (book.metadata?.pageCount) {
                  <span>{{ formatNumber(book.metadata!.pageCount!) }} pages</span>
                }
                @if (book.metadata?.language) {
                  <a class="hover:text-accent-text cursor-pointer transition-colors"
                     [routerLink]="['/all-books']"
                     [queryParams]="{ filter: 'language:' + book.metadata!.language }">
                    {{ book.metadata!.language }}
                  </a>
                }
                @if (primaryExternalRating(); as ext) {
                  @if (ext.url) {
                    <a class="inline-flex items-center gap-1 hover:text-ink transition-colors"
                       [href]="ext.url" target="_blank" rel="noopener noreferrer"
                       [title]="ext.tooltip">
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                      <span>{{ ext.rating }}</span>
                    </a>
                  } @else {
                    <span class="inline-flex items-center gap-1" [title]="ext.tooltip">
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                      <span>{{ ext.rating }}</span>
                    </span>
                  }
                }
              </div>

              <!-- Tags: genres + moods + tags + format -->
              <div class="flex flex-wrap items-center gap-1.5 mt-4">
                @for (t of visibleTags(); track t.value + t.type) {
                  <a class="inline-flex" [routerLink]="['/all-books']" [queryParams]="{ filter: t.filterKey + ':' + t.value }">
                    <app-tag [severity]="t.severity">{{ t.value }}</app-tag>
                  </a>
                }
                @if (hiddenTagCount() > 0 && !tagsExpanded()) {
                  <button
                    (click)="tagsExpanded.set(true)"
                    class="inline-flex items-center h-6 px-2.5 text-[11px] font-semibold tracking-wide leading-none rounded-[4px] bg-surface-hover text-ink-muted hover:text-ink cursor-pointer transition-colors"
                  >+{{ hiddenTagCount() }} more</button>
                }
                @if (tagsExpanded() && hiddenTagCount() > 0) {
                  <button
                    (click)="tagsExpanded.set(false)"
                    class="inline-flex items-center h-6 px-2.5 text-[11px] font-semibold tracking-wide leading-none rounded-[4px] bg-surface-hover text-ink-muted hover:text-ink cursor-pointer transition-colors"
                  >less</button>
                }
                @if (book.primaryFile?.bookType; as bookType) {
                  <app-tag severity="info">{{ formatLabel(bookType) }}</app-tag>
                }
              </div>

              <!-- Description -->
              <div class="mt-5">
                @if (book.metadata?.description) {
                  <div class="relative">
                    <div
                      #descriptionText
                      class="text-sm text-ink-light leading-relaxed"
                      [class.line-clamp-4]="!descriptionExpanded()"
                      [innerHTML]="sanitizedDescription()"
                    ></div>

                    @if (!descriptionExpanded() && descriptionCanExpand()) {
                      <button
                        (click)="toggleDescription()"
                        class="absolute right-0 bottom-0 bg-gradient-to-l from-surface via-surface to-transparent pl-10 text-sm leading-relaxed font-semibold text-accent-text hover:underline cursor-pointer"
                      >
                        more
                      </button>
                    }
                  </div>

                  @if (descriptionExpanded() && descriptionCanExpand()) {
                    <div class="mt-1 flex justify-end">
                      <button
                        (click)="toggleDescription()"
                        class="text-sm leading-relaxed font-semibold text-accent-text hover:underline cursor-pointer"
                      >
                        less
                      </button>
                    </div>
                  }
                }
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-2 mt-auto pt-6">
                @if (!book.isPhysical && book.primaryFile) {
                  <app-split-button
                    [label]="readButtonLabel()"
                    icon="pi pi-book"
                    [items]="readMenuItems()"
                    (clicked)="onRead()"
                  />
                }
                @if (canDownload() && !book.isPhysical && book.primaryFile) {
                  <app-button variant="secondary" (click)="onDownload()">
                    <i class="pi pi-download"></i>
                    {{ formatLabel(book.primaryFile.bookType ?? '') }}
                    @if (book.primaryFile.fileSizeKb) {
                      · {{ formatFileSize(book.primaryFile) }}
                    }
                  </app-button>
                }
                @if (canEditMetadata()) {
                  <app-button variant="secondary" (click)="onMetadataToggle($event)">
                    <i class="pi pi-pencil"></i>
                    Edit Metadata
                    <svg class="w-3.5 h-3.5 ml-0.5 -mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>
                  </app-button>
                }
                @if (moreMenuItems().length > 0) {
                  <app-button variant="secondary" (click)="onMoreToggle($event)">
                    <i class="pi pi-ellipsis-h"></i>
                  </app-button>
                }
              </div>
              <p-tieredMenu #metadataMenu [model]="metadataMenuItems()" [popup]="true" appendTo="body" />
              <p-tieredMenu #moreMenu [model]="moreMenuItems()" [popup]="true" appendTo="body" />

            </div>
          </div>

          <!-- Details section -->
          <div class="mt-8">
            <app-accordion [(value)]="activeAccordionPanel">
              <app-accordion-panel value="details">
                <div panel-header class="min-w-0">
                  <div class="text-sm text-ink font-medium">Details</div>
                </div>

                <div class="pt-1">
                  <dl class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-5">
                    @for (field of detailFields(); track field.label) {
                      <div class="min-w-0">
                        <dt class="text-[11px] uppercase tracking-[0.14em] text-ink-muted">{{ field.label }}</dt>
                        <dd class="mt-2 min-w-0">
                          @if (field.badgeTone) {
                            <span class="inline-flex items-center gap-1.5">
                              <span [class]="detailBadgeClass()">
                                <span [class]="detailBadgeDotClass(field.badgeTone)" aria-hidden="true"></span>
                                {{ field.value }}
                              </span>
                              @if (field.action === 'editStatus') {
                                <button class="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors cursor-pointer"
                                        (click)="statusMenu.toggle($event)">
                                  <i class="pi pi-pencil text-[10px]"></i>
                                </button>
                                <p-menu #statusMenu [model]="readStatusMenuItems" [popup]="true" appendTo="body" />
                              }
                              @if (field.action === 'resetProgress' || field.action === 'resetKoreader' || field.action === 'resetKobo') {
                                <button class="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-muted hover:bg-status-abandoned-bg hover:text-status-abandoned transition-colors cursor-pointer"
                                        (click)="onResetProgress(field.action)">
                                  <i class="pi pi-refresh text-[10px]"></i>
                                </button>
                              }
                            </span>
                          } @else if (field.clickFilter) {
                            <a [routerLink]="field.routerLink ?? ['/all-books']"
                               [queryParams]="{ filter: field.clickFilter.key + ':' + field.clickFilter.value }"
                               [class]="detailValueClass('accent') + ' hover:underline cursor-pointer'">{{ field.value }}</a>
                          } @else if (field.routerLink) {
                            <a [routerLink]="field.routerLink"
                               [class]="detailValueClass('accent') + ' hover:underline cursor-pointer'">{{ field.value }}</a>
                          } @else if (field.externalUrl) {
                            <a [href]="field.externalUrl" target="_blank" rel="noopener noreferrer"
                               class="inline-flex items-center gap-1.5 text-sm font-medium leading-tight text-accent-text hover:underline cursor-pointer">
                              {{ field.value }}
                              <svg class="w-3 h-3 text-ink-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                              </svg>
                            </a>
                          } @else {
                            <span [class]="detailValueClass(field.tone)">{{ field.value }}</span>
                          }
                        </dd>
                      </div>
                    }
                  </dl>

                  <!-- File path (hidden by default) -->
                  @if (book.primaryFile?.filePath) {
                    <div class="mt-6">
                      <div class="flex items-center gap-2">
                        <span class="text-[11px] uppercase tracking-[0.14em] text-ink-muted">File Path</span>
                        <button
                          (click)="showFilePath.set(!showFilePath())"
                          [attr.aria-label]="showFilePath() ? 'Hide file path' : 'Show file path'"
                          class="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors cursor-pointer"
                        >
                          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            @if (showFilePath()) {
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                              <path d="m1 1 22 22"/>
                            } @else {
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            }
                          </svg>
                        </button>
                      </div>
                      @if (showFilePath()) {
                        <code class="mt-2 block max-w-full break-all rounded-[6px] bg-surface-sunken px-2.5 py-1.5 text-xs text-ink-muted font-mono">{{ book.primaryFile!.filePath }}</code>
                      }
                    </div>
                  }
                </div>
              </app-accordion-panel>
            </app-accordion>
          </div>

          <!-- Comic metadata section -->
          @if (isComicBook(book) && hasComicMetadata(book)) {
            <div class="mt-4">
              <app-accordion [(value)]="comicAccordionPanel">
                <app-accordion-panel value="comic">
                  <div panel-header class="min-w-0">
                    <div class="text-sm text-ink font-medium">Comic Details</div>
                  </div>
                  <div class="pt-1">
                    <dl class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-5">
                      @for (field of comicFields(); track field.label) {
                        <div class="min-w-0">
                          <dt class="text-[11px] uppercase tracking-[0.14em] text-ink-muted">{{ field.label }}</dt>
                          <dd class="mt-2 min-w-0">
                            <span [class]="detailValueClass(field.tone)">{{ field.value }}</span>
                          </dd>
                        </div>
                      }
                    </dl>
                    @if (hasComicCreators(book.metadata!.comicMetadata!)) {
                      <div class="mt-5 pt-4 border-t border-edge-light">
                        <h4 class="text-[11px] uppercase tracking-[0.14em] text-ink-muted mb-3">Creators</h4>
                        <dl class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-4">
                          @for (crew of comicCreators(); track crew.role) {
                            <div class="min-w-0">
                              <dt class="text-[11px] uppercase tracking-[0.14em] text-ink-muted">{{ crew.role }}</dt>
                              <dd class="mt-1.5 text-sm text-accent-text font-medium">{{ crew.names }}</dd>
                            </div>
                          }
                        </dl>
                      </div>
                    }
                  </div>
                </app-accordion-panel>
              </app-accordion>
            </div>
          }

          <!-- Tabs section -->
          <div class="mt-10">
            <app-tabs [(value)]="activeTab">
              <app-tab-list [scrollable]="true">
                @if (seriesBooks().length > 1) {
                  <app-tab value="series">More in Series</app-tab>
                }
                <app-tab value="similar">Similar Books</app-tab>
                <app-tab value="files">Files</app-tab>
                <app-tab value="notes">Notes</app-tab>
                <app-tab value="sessions">Reading Sessions</app-tab>
                <app-tab value="reviews">Reviews</app-tab>
              </app-tab-list>

              @if (seriesBooks().length > 1) {
                <app-tab-panel value="series">
                  <div class="flex gap-3 overflow-x-auto pb-2">
                    @for (sb of seriesBooks(); track sb.id) {
                      @if (sb.id !== book.id) {
                        <a [routerLink]="['/book', sb.id]" class="flex-shrink-0 w-[120px] group cursor-pointer">
                          <div
                            class="aspect-[2/3] rounded-[6px] shadow-paper overflow-hidden cover-depth cover-spine mb-2 group-hover:shadow-paper-hover transition-shadow"
                          >
                            @if (getSeriesBookCover(sb); as coverSrc) {
                              <img
                                [src]="coverSrc"
                                [alt]="sb.metadata?.title ?? ''"
                                class="w-full h-full object-cover"
                              />
                            } @else {
                              <app-cover-placeholder [title]="sb.metadata?.title ?? ''" [author]="(sb.metadata?.authors ?? []).join(', ')" size="sm" />
                            }
                          </div>
                          <p class="text-xs text-ink truncate">{{ sb.metadata?.title }}</p>
                          @if (sb.metadata?.seriesNumber != null) {
                            <p class="text-[10px] text-ink-muted">#{{ sb.metadata!.seriesNumber }}</p>
                          }
                        </a>
                      }
                    }
                  </div>
                </app-tab-panel>
              }

              <app-tab-panel value="similar">
                <p class="text-sm text-ink-muted">No similar books found yet.</p>
              </app-tab-panel>

              <app-tab-panel value="files">
                <div class="space-y-3 max-w-[600px]">
                  @if (book.primaryFile) {
                    <div class="flex items-center justify-between px-4 py-3 bg-surface-raised rounded-[6px] shadow-paper">
                      <div class="flex items-center gap-3">
                        <i class="pi pi-file text-ink-muted"></i>
                        <div>
                          <p class="text-sm text-ink font-medium">{{ book.primaryFile.fileName }}</p>
                          <p class="text-xs text-ink-muted">{{ formatLabel(book.primaryFile.bookType ?? '') }} · {{ formatFileSize(book.primaryFile) }} · Primary</p>
                        </div>
                      </div>
                      @if (canDownload()) {
                        <div class="flex gap-1">
                          <app-button variant="secondary" (click)="onDownload()"><i class="pi pi-download"></i></app-button>
                        </div>
                      }
                    </div>
                  }
                  @for (alt of book.alternativeFormats ?? []; track alt.id) {
                    <div class="flex items-center justify-between px-4 py-3 bg-surface-raised rounded-[6px] shadow-paper">
                      <div class="flex items-center gap-3">
                        <i class="pi pi-file text-ink-muted"></i>
                        <div>
                          <p class="text-sm text-ink font-medium">{{ alt.fileName }}</p>
                          <p class="text-xs text-ink-muted">{{ formatLabel(alt.bookType ?? '') }} · {{ formatFileSize(alt) }}</p>
                        </div>
                      </div>
                      @if (canDownload()) {
                        <div class="flex gap-1">
                          <app-button variant="secondary" (click)="onDownloadAdditional(alt.id)"><i class="pi pi-download"></i></app-button>
                        </div>
                      }
                    </div>
                  }
                  @if (!book.primaryFile && !(book.alternativeFormats?.length)) {
                    <p class="text-sm text-ink-muted">No files available.</p>
                  }
                </div>
              </app-tab-panel>

              <app-tab-panel value="notes">
                <p class="text-sm text-ink-muted">No notes yet.</p>
              </app-tab-panel>

              <app-tab-panel value="sessions">
                <p class="text-sm text-ink-muted">No reading sessions recorded.</p>
              </app-tab-panel>

              <app-tab-panel value="reviews">
                <p class="text-sm text-ink-muted">No reviews available.</p>
              </app-tab-panel>
            </app-tabs>
          </div>
        </div>
      </div>
    } @else if (isLoading()) {
      <div class="flex items-center justify-center h-64">
        <p class="text-ink-muted">Loading...</p>
      </div>
    } @else {
      <div class="flex items-center justify-center h-64">
        <p class="text-ink-muted">Book not found.</p>
      </div>
    }
  `,
})
export class BookDetailPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private bookService = inject(BookService);
  private bookFileService = inject(BookFileService);
  private urlHelper = inject(UrlHelperService);
  private userService = inject(UserService);
  private appSettingsService = inject(AppSettingsService);
  private libraryService = inject(LibraryService);
  private emailService = inject(EmailService);
  private taskHelper = inject(TaskHelperService);
  private popupService = inject(PopupMenuService);
  toast = inject(ToastService);
  navService = inject(BookNavigationService);

  amazonDomain = 'com';

  private bookId = toSignal(
    this.route.paramMap.pipe(map(params => Number(params.get('bookId')))),
    { initialValue: Number(this.route.snapshot.paramMap.get('bookId')) }
  );

  private bookQuery = injectQuery(() => {
    const id = this.bookId();
    if (!id) {
      return {
        queryKey: ['books', 'detail', -1, true] as const,
        queryFn: async (): Promise<Book> => { throw new Error('No book selected'); },
        enabled: false,
      };
    }
    return this.bookService.bookDetailQueryOptions(id, true);
  });

  book = computed(() => this.bookQuery.data() ?? null);
  isLoading = computed(() => this.bookQuery.isPending());

  descriptionExpanded = signal(false);
  tagsExpanded = signal(false);
  activeTab = signal('similar');
  activeAccordionPanel: string | number | null = 'details';
  comicAccordionPanel: string | number | null = 'comic';
  showFilePath = signal(false);
  descriptionCanExpand = signal(false);
  selectedReadStatus = signal<ReadStatus>(ReadStatus.UNREAD);

  seriesBooks = signal<Book[]>([]);

  private metadataMenu = viewChild<TieredMenu>('metadataMenu');
  private moreMenu = viewChild<TieredMenu>('moreMenu');
  private descriptionText = viewChild<ElementRef<HTMLElement>>('descriptionText');
  private descriptionResizeObserver?: ResizeObserver;

  // --- Computed ---

  coverUrl = computed(() => {
    const b = this.book();
    if (!b?.metadata?.coverUpdatedOn) return null;
    return this.urlHelper.getDirectThumbnailUrl(b.id, b.metadata.coverUpdatedOn);
  });

  authors = computed(() => this.book()?.metadata?.authors?.join(', ') ?? '');

  allTags = computed(() => {
    const m = this.book()?.metadata;
    if (!m) return [];
    type TagEntry = { value: string; type: string; severity: 'default' | 'info' | 'success'; filterKey: string };
    const tags: TagEntry[] = [];
    for (const v of m.categories ?? []) tags.push({ value: v, type: 'category', severity: 'default', filterKey: 'category' });
    for (const v of m.moods ?? []) tags.push({ value: v, type: 'mood', severity: 'info', filterKey: 'mood' });
    for (const v of m.tags ?? []) tags.push({ value: v, type: 'tag', severity: 'success', filterKey: 'tag' });
    return tags;
  });

  private readonly TAG_LIMIT = 3;

  visibleTags = computed(() => {
    const all = this.allTags();
    if (this.tagsExpanded() || all.length <= this.TAG_LIMIT) return all;
    return all.slice(0, this.TAG_LIMIT);
  });

  hiddenTagCount = computed(() => {
    const all = this.allTags();
    return all.length > this.TAG_LIMIT ? all.length - this.TAG_LIMIT : 0;
  });

  navPosition = computed(() => this.navService.currentPosition());

  primaryExternalRating = computed<{ rating: string; url: string; tooltip: string; source: string } | null>(() => {
    const m = this.book()?.metadata;
    if (!m) return null;

    const provider = m.provider?.toLowerCase() ?? '';

    // Try the book's metadata provider first, then fall back through common providers
    const sources: { key: string; rating: number | null | undefined; id: string | null | undefined; urlFn: (id: string) => string; label: string }[] = [
      { key: 'goodreads', rating: m.goodreadsRating, id: m.goodreadsId, urlFn: id => `https://www.goodreads.com/book/show/${id}`, label: 'Goodreads' },
      { key: 'amazon', rating: m.amazonRating, id: m.asin, urlFn: id => `https://www.amazon.${this.amazonDomain}/dp/${id}`, label: 'Amazon' },
      { key: 'hardcover', rating: m.hardcoverRating, id: m.hardcoverId, urlFn: id => `https://hardcover.app/books/${id}`, label: 'Hardcover' },
      { key: 'audible', rating: m.audibleRating, id: m.audibleId, urlFn: id => `https://www.audible.com/pd/${id}`, label: 'Audible' },
      { key: 'lubimyczytac', rating: m.lubimyczytacRating, id: m.lubimyczytacId, urlFn: id => `https://lubimyczytac.pl/ksiazka/${id}/ksiazka`, label: 'Lubimyczytac' },
      { key: 'ranobedb', rating: m.ranobedbRating, id: m.ranobedbId, urlFn: id => `https://ranobedb.org/book/${id}`, label: 'Ranobedb' },
    ];

    // Sort so the book's provider comes first
    const sorted = [...sources].sort((a, b) => {
      const aMatch = provider.includes(a.key) ? 0 : 1;
      const bMatch = provider.includes(b.key) ? 0 : 1;
      return aMatch - bMatch;
    });

    // Find first source with a rating
    for (const s of sorted) {
      if (s.rating != null) {
        return {
          rating: String(s.rating),
          url: s.id ? s.urlFn(s.id) : '',
          tooltip: `${s.label} — ★ ${s.rating}`,
          source: s.label,
        };
      }
    }

    return null;
  });

  private currentUser = computed(() => this.userService.currentUser());

  canEditMetadata = computed(() => {
    const user = this.currentUser();
    if (!user) return false;
    return user.permissions?.canEditMetadata || user.permissions?.admin || false;
  });

  canDownload = computed(() => {
    const user = this.currentUser();
    if (!user) return false;
    return user.permissions?.canDownload || user.permissions?.admin || false;
  });

  canDeleteBook = computed(() => {
    const user = this.currentUser();
    if (!user) return false;
    return user.permissions?.canDeleteBook || user.permissions?.admin || false;
  });

  canUpload = computed(() => {
    const user = this.currentUser();
    if (!user) return false;
    return user.permissions?.canUpload || user.permissions?.admin || false;
  });

  canManageLibrary = computed(() => {
    const user = this.currentUser();
    if (!user) return false;
    return user.permissions?.canManageLibrary || user.permissions?.admin || false;
  });

  canEmailBook = computed(() => {
    const user = this.currentUser();
    if (!user) return false;
    return user.permissions?.canEmailBook || user.permissions?.admin || false;
  });

  sanitizedDescription = computed(() => {
    const desc = this.book()?.metadata?.description;
    return desc ? DOMPurify.sanitize(desc) : '';
  });

  primaryProgress = computed(() => {
    const b = this.book();
    if (!b) return null;
    const type = b.primaryFile?.bookType;
    switch (type) {
      case 'PDF': return b.pdfProgress?.percentage ?? null;
      case 'EPUB': case 'FB2': case 'MOBI': case 'AZW3': return b.epubProgress?.percentage ?? null;
      case 'CBX': return b.cbxProgress?.percentage ?? null;
      case 'AUDIOBOOK': return b.audiobookProgress?.percentage ?? null;
      default: return null;
    }
  });

  readButtonLabel = computed(() => {
    const b = this.book();
    if (!b) return 'Read';
    const status = b.readStatus;
    const progress = this.primaryProgress();
    const isAudiobook = b.primaryFile?.bookType === 'AUDIOBOOK';
    if (status === ReadStatus.READ) return isAudiobook ? 'Listen Again' : 'Read Again';
    if (status === ReadStatus.READING || status === ReadStatus.RE_READING || status === ReadStatus.PAUSED) {
      if (isAudiobook) return 'Continue';
      return progress != null ? `Continue Reading (${Math.round(progress)}%)` : 'Continue Reading';
    }
    return isAudiobook ? 'Play' : 'Read';
  });

  readMenuItems = computed<MenuItem[]>(() => {
    const b = this.book();
    if (!b) return [];
    const items: MenuItem[] = [];
    const primaryType = b.primaryFile?.bookType;

    if (primaryType === 'EPUB') {
      items.push({ label: 'Streaming Reader', icon: 'pi pi-play', command: () => this.bookService.readBook(b.id, 'epub-streaming') });
    }

    const readableAlts = b.alternativeFormats?.filter(f =>
      f.bookType && ['PDF', 'EPUB', 'FB2', 'MOBI', 'AZW3', 'CBX', 'AUDIOBOOK'].includes(f.bookType)
    ) ?? [];
    const uniqueAltTypes = [...new Set(readableAlts.map(f => f.bookType))];

    if (uniqueAltTypes.length > 0 && items.length > 0) items.push({ separator: true });

    uniqueAltTypes.forEach(formatType => {
      if (formatType === 'EPUB') {
        items.push({
          label: formatType, icon: 'pi pi-book',
          items: [
            { label: 'Standard Reader', icon: 'pi pi-book', command: () => this.bookService.readBook(b.id, undefined, formatType) },
            { label: 'Streaming Reader', icon: 'pi pi-play', command: () => this.bookService.readBook(b.id, 'epub-streaming', formatType) },
          ],
        });
      } else {
        items.push({ label: formatType ?? 'File', icon: 'pi pi-book', command: () => this.bookService.readBook(b.id, undefined, formatType) });
      }
    });

    return items;
  });

  metadataMenuItems = computed<MenuItem[]>(() => {
    const b = this.book();
    if (!b) return [];
    return [
      { label: 'Auto Fetch', icon: 'pi pi-bolt', command: () => this.taskHelper.refreshMetadataTask({ bookIds: [b.id], refreshType: MetadataRefreshType.BOOKS }).subscribe() },
      { label: 'Search', icon: 'pi pi-search', command: () => { /* TODO: migrate to ModalService */ } },
      { label: 'Manual Edit', icon: 'pi pi-pencil', command: () => { /* TODO: migrate to ModalService */ } },
      { label: 'Sidecar', icon: 'pi pi-file', command: () => { /* TODO: migrate to ModalService */ } },
    ];
  });

  moreMenuItems = computed<MenuItem[]>(() => {
    const b = this.book();
    if (!b) return [];
    const items: MenuItem[] = [];

    items.push({ label: 'Assign to Shelf', icon: 'pi pi-folder', command: () => { /* TODO: migrate to ModalService */ } });

    if (this.canManageLibrary()) {
      const isPhysical = b.isPhysical ?? false;
      items.push({
        label: isPhysical ? 'Unmark as Physical' : 'Mark as Physical',
        icon: isPhysical ? 'pi pi-times-circle' : 'pi pi-book',
        command: () => this.bookService.togglePhysicalFlag(b.id, !isPhysical).subscribe(),
      });
    }

    if (this.canUpload()) {
      items.push({ label: 'Upload File', icon: 'pi pi-upload', command: () => { /* TODO: migrate to ModalService */ } });
    }

    const hasFiles = !!b.primaryFile;
    const isLocalStorage = this.appSettingsService.appSettings()?.diskType === 'LOCAL';

    if (hasFiles && this.canManageLibrary() && isLocalStorage) {
      items.push({ label: 'Organize Files', icon: 'pi pi-arrows-h', command: () => { /* TODO: migrate to ModalService */ } });
    }

    if (hasFiles && this.canEmailBook()) {
      items.push({
        label: 'Send Book', icon: 'pi pi-send',
        items: [
          { label: 'Quick Send', icon: 'pi pi-bolt', command: () => this.quickSend(b) },
          { label: 'Custom Send', icon: 'pi pi-cog', command: () => { /* TODO: migrate to ModalService */ } },
        ],
      });
    }

    const isSingleFileBook = hasFiles && !b.alternativeFormats?.length;
    const library = this.libraryService.findLibraryById(b.libraryId);
    const isMultiFormatLibrary = !library?.allowedFormats?.length || library.allowedFormats.length > 1;
    if (isSingleFileBook && isMultiFormatLibrary && this.canManageLibrary()) {
      items.push({ label: 'Attach to Another Book', icon: 'pi pi-link', command: () => { /* TODO: migrate to ModalService */ } });
    }

    if (this.canDeleteBook()) {
      items.push({ separator: true });
      items.push({
        label: 'Delete Book', icon: 'pi pi-trash',
        command: () => {
          this.bookService.deleteBooks(new Set([b.id])).subscribe({ next: () => this.router.navigate(['/dashboard']) });
        },
      });
    }

    return items;
  });

  readStatusMenuItems: MenuItem[] = [
    { label: 'Unread', command: () => this.updateReadStatus(ReadStatus.UNREAD) },
    { label: 'Reading', command: () => this.updateReadStatus(ReadStatus.READING) },
    { label: 'Re-reading', command: () => this.updateReadStatus(ReadStatus.RE_READING) },
    { label: 'Read', command: () => this.updateReadStatus(ReadStatus.READ) },
    { label: 'Partially Read', command: () => this.updateReadStatus(ReadStatus.PARTIALLY_READ) },
    { label: 'Paused', command: () => this.updateReadStatus(ReadStatus.PAUSED) },
    { label: 'Abandoned', command: () => this.updateReadStatus(ReadStatus.ABANDONED) },
    { label: "Won't Read", command: () => this.updateReadStatus(ReadStatus.WONT_READ) },
  ];

  detailFields = computed(() => {
    const b = this.book();
    if (!b) return [];

    const progress = this.primaryProgress();
    const koreaderProg = b.koreaderProgress?.percentage;
    const koboProg = b.koboProgress?.percentage;
    const status = this.selectedReadStatus();

    const fields: DetailField[] = [
      { label: 'Library', value: b.libraryName ?? '', routerLink: ['/library', b.libraryId, 'books'] },
      { label: 'Publisher', value: b.metadata?.publisher ?? '', clickFilter: b.metadata?.publisher ? { key: 'publisher', value: b.metadata.publisher } : undefined },
      { label: 'Published', value: b.metadata?.publishedDate ?? '', clickFilter: b.metadata?.publishedDate ? { key: 'publishedDate', value: this.extractYear(b.metadata.publishedDate) } : undefined },
      { label: 'Language', value: b.metadata?.language ?? '', clickFilter: b.metadata?.language ? { key: 'language', value: b.metadata.language } : undefined },
      { label: 'ISBN', value: [b.metadata?.isbn13, b.metadata?.isbn10].filter(Boolean).join(' / ') },
      { label: 'Page Count', value: b.metadata?.pageCount ? this.formatNumber(b.metadata.pageCount) : '' },
      { label: 'Read Status', value: this.formatReadStatus(status), badgeTone: this.getStatusTone(status), action: 'editStatus' },
      ...(progress != null ? [{
        label: 'Reading Progress', value: `${Math.round(progress)}%`,
        badgeTone: (progress >= 100 ? 'success' : 'accent') as DetailBadgeTone, action: 'resetProgress' as const,
      }] : []),
      ...(koreaderProg != null ? [{
        label: 'KoReader Progress', value: `${Math.round(koreaderProg * 10) / 10}%`,
        badgeTone: (koreaderProg >= 100 ? 'success' : 'warn') as DetailBadgeTone, action: 'resetKoreader' as const,
      }] : []),
      ...(koboProg != null ? [{
        label: 'Kobo Progress', value: `${Math.round(koboProg * 10) / 10}%`,
        badgeTone: (koboProg >= 100 ? 'success' : 'info') as DetailBadgeTone, action: 'resetKobo' as const,
      }] : []),
      ...(status === ReadStatus.READ && b.dateFinished ? [{
        label: 'Date Finished', value: this.formatDateAdded(b.dateFinished),
      }] : []),
      ...(b.metadataMatchScore != null ? [{
        label: 'Metadata Match', value: `${Math.round(b.metadataMatchScore)}%`, badgeTone: 'accent' as DetailBadgeTone,
      }] : []),
      ...(b.metadata?.ageRating != null ? [{
        label: 'Age Rating', value: this.getAgeRatingLabel(b.metadata.ageRating),
        clickFilter: { key: 'ageRating', value: String(b.metadata.ageRating) },
      }] : []),
      ...(b.metadata?.contentRating ? [{
        label: 'Content Rating', value: CONTENT_RATING_LABELS[b.metadata.contentRating] ?? b.metadata.contentRating,
        clickFilter: { key: 'contentRating', value: b.metadata.contentRating },
      }] : []),
      // Audiobook metadata
      ...(b.metadata?.narrator ? [{ label: 'Narrator', value: b.metadata.narrator, clickFilter: { key: 'narrator', value: b.metadata.narrator } }] : []),
      ...(b.metadata?.audiobookMetadata?.durationSeconds ? [{ label: 'Duration', value: this.formatDuration(b.metadata.audiobookMetadata.durationSeconds) }] : []),
      ...(b.metadata?.audiobookMetadata?.chapterCount ? [{ label: 'Chapters', value: String(b.metadata.audiobookMetadata.chapterCount) }] : []),
      ...(b.metadata?.abridged != null ? [{ label: 'Abridged', value: b.metadata.abridged ? 'Yes' : 'No' }] : []),
      // External links
      ...(b.metadata?.goodreadsId ? [{ label: 'Goodreads', value: b.metadata.goodreadsRating ? `★ ${b.metadata.goodreadsRating}` : b.metadata.goodreadsId, externalUrl: `https://www.goodreads.com/book/show/${b.metadata.goodreadsId}` }] : []),
      ...(b.metadata?.asin ? [{ label: 'Amazon', value: b.metadata.amazonRating ? `★ ${b.metadata.amazonRating}` : b.metadata.asin, externalUrl: `https://www.amazon.${this.amazonDomain}/dp/${b.metadata.asin}` }] : []),
      ...(b.metadata?.hardcoverId ? [{ label: 'Hardcover', value: b.metadata.hardcoverRating ? `★ ${b.metadata.hardcoverRating}` : b.metadata.hardcoverId, externalUrl: `https://hardcover.app/books/${b.metadata.hardcoverId}` }] : []),
      ...(b.metadata?.audibleId ? [{ label: 'Audible', value: b.metadata.audibleRating ? `★ ${b.metadata.audibleRating}` : b.metadata.audibleId, externalUrl: `https://www.audible.com/pd/${b.metadata.audibleId}` }] : []),
      ...(b.metadata?.lubimyczytacId ? [{ label: 'Lubimyczytac', value: b.metadata.lubimyczytacRating ? `★ ${b.metadata.lubimyczytacRating}` : b.metadata.lubimyczytacId, externalUrl: `https://lubimyczytac.pl/ksiazka/${b.metadata.lubimyczytacId}/ksiazka` }] : []),
      ...(b.metadata?.ranobedbId ? [{ label: 'Ranobedb', value: b.metadata.ranobedbRating ? `★ ${b.metadata.ranobedbRating}` : b.metadata.ranobedbId, externalUrl: `https://ranobedb.org/book/${b.metadata.ranobedbId}` }] : []),
      ...(b.metadata?.googleId ? [{ label: 'Google Books', value: b.metadata.googleId, externalUrl: `https://books.google.com/books?id=${b.metadata.googleId}` }] : []),
      ...(b.metadata?.comicvineId ? [{ label: 'ComicVine', value: b.metadata.comicvineId, externalUrl: b.metadata.comicMetadata?.webLink ?? `https://comicvine.gamespot.com/issue/${b.metadata.comicvineId}` }] : []),
      { label: 'Format', value: b.primaryFile?.bookType ? FORMAT_LABELS[b.primaryFile.bookType] ?? b.primaryFile.bookType : '' },
      { label: 'File Size', value: b.primaryFile?.fileSizeKb ? this.formatFileSize(b.primaryFile) : '' },
      { label: 'Date Added', value: b.addedOn ? this.formatDateAdded(b.addedOn) : '' },
    ];
    return fields.filter(f => Boolean(f.value));
  });

  comicFields = computed(() => {
    const b = this.book();
    const c = b?.metadata?.comicMetadata;
    if (!c) return [];
    const fields: DetailField[] = [
      ...(c.issueNumber ? [{ label: 'Issue', value: `#${c.issueNumber}` }] : []),
      ...(c.volumeName ? [{ label: 'Volume', value: c.volumeName + (c.volumeNumber ? ` Vol. ${c.volumeNumber}` : '') }] : []),
      ...(c.storyArc ? [{ label: 'Story Arc', value: c.storyArc + (c.storyArcNumber ? ` (#${c.storyArcNumber})` : '') }] : []),
      ...(c.alternateSeries ? [{ label: 'Alternate Series', value: c.alternateSeries + (c.alternateIssue ? ` #${c.alternateIssue}` : '') }] : []),
      ...(c.format ? [{ label: 'Format', value: c.format }] : []),
      ...(c.imprint ? [{ label: 'Imprint', value: c.imprint }] : []),
      ...(c.readingDirection ? [{ label: 'Reading Direction', value: c.readingDirection }] : []),
      ...(c.blackAndWhite != null ? [{ label: 'B&W', value: c.blackAndWhite ? 'Yes' : 'No' }] : []),
      ...(c.manga != null ? [{ label: 'Manga', value: c.manga ? 'Yes' : 'No' }] : []),
    ];
    return fields;
  });

  comicCreators = computed(() => {
    const c = this.book()?.metadata?.comicMetadata;
    if (!c) return [];
    const crews: { role: string; names: string }[] = [];
    if (c.pencillers?.length) crews.push({ role: 'Pencillers', names: c.pencillers.join(', ') });
    if (c.inkers?.length) crews.push({ role: 'Inkers', names: c.inkers.join(', ') });
    if (c.colorists?.length) crews.push({ role: 'Colorists', names: c.colorists.join(', ') });
    if (c.letterers?.length) crews.push({ role: 'Letterers', names: c.letterers.join(', ') });
    if (c.coverArtists?.length) crews.push({ role: 'Cover Artists', names: c.coverArtists.join(', ') });
    if (c.editors?.length) crews.push({ role: 'Editors', names: c.editors.join(', ') });
    return crews;
  });

  // --- Lifecycle ---

  ngOnInit(): void {
    const settings = this.appSettingsService.appSettings();
    if (settings) {
      this.amazonDomain = (settings as any).metadataProviderSettings?.amazon?.domain ?? 'com';
    }

    this.route.paramMap
      .pipe(map(params => Number(params.get('bookId'))), takeUntilDestroyed(this.destroyRef))
      .subscribe(bookId => {
        this.navService.updateCurrentBook(bookId);
        this.descriptionExpanded.set(false);
        this.tagsExpanded.set(false);
        this.loadSeriesBooks(bookId);
        this.scheduleDescriptionMeasurement();
        // Sync read status when book data arrives
        const b = this.book();
        if (b) this.selectedReadStatus.set(b.readStatus ?? ReadStatus.UNREAD);
      });
  }

  constructor() {
    this.destroyRef.onDestroy(() => this.descriptionResizeObserver?.disconnect());

    afterNextRender(() => this.scheduleDescriptionMeasurement());

    // Re-measure description when book data loads (description element won't exist until then)
    effect(() => {
      this.sanitizedDescription(); // track description changes
      requestAnimationFrame(() => this.scheduleDescriptionMeasurement());
    });
  }

  // --- Actions ---

  onRead() {
    const b = this.book();
    if (b) this.bookService.readBook(b.id);
  }

  onDownload() {
    const b = this.book();
    if (b) this.bookFileService.downloadFile(b);
  }

  onDownloadAdditional(fileId: number) {
    const b = this.book();
    if (b) this.bookFileService.downloadAdditionalFile(b, fileId);
  }

  onMetadataToggle(event: Event) {
    const m = this.metadataMenu();
    if (!m) return;
    this.popupService.register(m);
    m.toggle(event);
  }

  onMoreToggle(event: Event) {
    const m = this.moreMenu();
    if (!m) return;
    this.popupService.register(m);
    m.toggle(event);
  }

  toggleDescription() {
    const next = !this.descriptionExpanded();
    this.descriptionExpanded.set(next);
    if (!next) this.scheduleDescriptionMeasurement();
  }

  updateReadStatus(status: ReadStatus) {
    const b = this.book();
    if (!b) return;
    this.bookService.updateBookReadStatus(b.id, status).subscribe({
      next: () => {
        this.selectedReadStatus.set(status);
        this.toast.info('Read Status', `Updated to ${this.formatReadStatus(status)}`);
      },
    });
  }

  onPersonalRatingChange(book: Book, rating: number) {
    this.bookService.updatePersonalRating(book.id, rating).subscribe({
      next: () => this.toast.info('Rating', 'Rating saved'),
    });
  }

  onResetProgress(action: string) {
    const b = this.book();
    if (!b) return;
    const typeMap: Record<string, ResetProgressType> = {
      resetProgress: ResetProgressTypes.GRIMMORY,
      resetKoreader: ResetProgressTypes.KOREADER,
      resetKobo: ResetProgressTypes.KOBO,
    };
    const type = typeMap[action];
    if (type) {
      this.bookService.resetProgress(b.id, type).subscribe({
        next: () => this.toast.info('Progress', 'Progress reset'),
      });
    }
  }

  private quickSend(book: Book) {
    this.emailService.emailBookQuick(book.id).subscribe({
      next: () => this.toast.info('Send', 'Book sent'),
      error: (err: any) => this.toast.error('Send', err?.error?.message || 'Failed to send'),
    });
  }

  getSeriesBookCover(sb: Book): string {
    return this.urlHelper.getThumbnailUrl(sb.id, sb.metadata?.coverUpdatedOn);
  }

  // --- Helpers ---

  formatLabel(format: string): string {
    return FORMAT_LABELS[format] ?? format;
  }

  formatNumber(value: number): string {
    return new Intl.NumberFormat().format(value);
  }

  formatFileSize(fileInfo: FileInfo | null | undefined): string {
    const sizeKb = fileInfo?.fileSizeKb;
    if (sizeKb == null) return '-';
    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = sizeKb;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) { size /= 1024; unitIndex++; }
    const decimals = size >= 100 ? 0 : size >= 10 ? 1 : 2;
    return `${size.toFixed(decimals)} ${units[unitIndex]}`;
  }

  formatDateAdded(value: string): string {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  }

  formatReadStatus(status?: ReadStatus): string {
    if (!status) return 'Unknown';
    const labels: Record<string, string> = {
      UNREAD: 'Unread', READING: 'Reading', RE_READING: 'Re-reading', READ: 'Read',
      PARTIALLY_READ: 'Partially Read', PAUSED: 'Paused', WONT_READ: "Won't Read",
      ABANDONED: 'Abandoned', UNSET: 'Unset',
    };
    return labels[status] ?? status;
  }

  extractYear(dateString: string | null | undefined): string {
    if (!dateString) return '';
    const match = dateString.match(/\d{4}/);
    return match ? match[0] : dateString;
  }

  hasExternalRatings(book: Book): boolean {
    const m = book.metadata;
    if (!m) return false;
    return !!(m.amazonRating || m.asin || m.goodreadsRating || m.goodreadsId ||
      m.hardcoverRating || m.hardcoverId || m.lubimyczytacRating || m.lubimyczytacId ||
      m.ranobedbRating || m.ranobedbId || m.audibleRating || m.audibleId || m.googleId);
  }

  getRatingPercent(rating: number): number {
    return Math.round((rating / 5) * 100);
  }

  getRatingTooltip(book: Book, source: string): string {
    const m = book.metadata;
    if (!m) return '';
    switch (source) {
      case 'amazon': return m.amazonRating != null ? `★ ${m.amazonRating} | ${m.amazonReviewCount?.toLocaleString() ?? '0'} reviews` : '';
      case 'goodreads': return m.goodreadsRating != null ? `★ ${m.goodreadsRating} | ${m.goodreadsReviewCount?.toLocaleString() ?? '0'} reviews` : '';
      case 'hardcover': return m.hardcoverRating != null ? `★ ${m.hardcoverRating} | ${m.hardcoverReviewCount?.toLocaleString() ?? '0'} reviews` : '';
      case 'lubimyczytac': return m.lubimyczytacRating != null ? `★ ${m.lubimyczytacRating}` : '';
      case 'ranobedb': return m.ranobedbRating != null ? `★ ${m.ranobedbRating}` : '';
      case 'audible': return m.audibleRating != null ? `★ ${m.audibleRating} | ${m.audibleReviewCount?.toLocaleString() ?? '0'} reviews` : '';
      default: return '';
    }
  }

  isComicBook(book: Book): boolean {
    return book.primaryFile?.bookType === 'CBX';
  }

  hasComicMetadata(book: Book): boolean {
    return !!book.metadata?.comicMetadata;
  }

  hasComicCreators(c: ComicMetadata): boolean {
    return !!(c.pencillers?.length || c.inkers?.length || c.colorists?.length ||
      c.letterers?.length || c.coverArtists?.length || c.editors?.length);
  }

  formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  private getAgeRatingLabel(ageRating: number | null | undefined): string {
    if (ageRating == null) return '-';
    const match = AGE_RATING_OPTIONS.find(r => r.id === ageRating);
    return match?.label ?? `${ageRating}+`;
  }

  private getStatusTone(status?: ReadStatus): DetailBadgeTone {
    const tones: Record<string, DetailBadgeTone> = {
      READ: 'success', READING: 'info', RE_READING: 'info', PAUSED: 'warn',
      UNREAD: 'accent', PARTIALLY_READ: 'info', WONT_READ: 'danger', ABANDONED: 'danger', UNSET: 'accent',
    };
    return tones[status ?? ''] ?? 'accent';
  }

  private readonly detailValueToneClasses: Record<DetailFieldTone, string> = {
    default: 'block break-words text-sm font-medium leading-tight text-ink',
    accent: 'block break-words text-sm font-medium leading-tight text-accent-text',
  };

  private readonly detailBadgeDotToneClasses: Record<DetailBadgeTone, string> = {
    accent: 'bg-accent-text', success: 'bg-status-finished', info: 'bg-status-reading',
    warn: 'bg-status-to-read', danger: 'bg-status-abandoned',
  };

  detailValueClass(tone: DetailFieldTone = 'default'): string {
    return this.detailValueToneClasses[tone];
  }

  detailBadgeClass(): string {
    return 'inline-flex items-center gap-1.5 rounded-full border border-edge-light bg-accent-wash px-2 py-0.5 text-sm font-medium text-accent-text';
  }

  detailBadgeDotClass(tone: DetailBadgeTone): string {
    return `h-1.5 w-1.5 rounded-full ${this.detailBadgeDotToneClasses[tone]}`;
  }

  // --- Series ---

  private loadSeriesBooks(bookId: number) {
    this.bookService.getBooksInSeries(bookId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(books => {
        const sorted = books.sort((a, b) => (a.metadata?.seriesNumber ?? 0) - (b.metadata?.seriesNumber ?? 0));
        this.seriesBooks.set(sorted);
        if (sorted.length > 1 && this.activeTab() === 'similar') this.activeTab.set('series');
      });
  }

  // --- Description measurement ---

  private scheduleDescriptionMeasurement() {
    requestAnimationFrame(() => { this.observeDescriptionElement(); this.measureDescriptionOverflow(); });
  }

  private observeDescriptionElement() {
    const el = this.descriptionText()?.nativeElement;
    this.descriptionResizeObserver?.disconnect();
    this.descriptionResizeObserver = undefined;
    if (!el || typeof ResizeObserver === 'undefined') return;
    this.descriptionResizeObserver = new ResizeObserver(() => { if (!this.descriptionExpanded()) this.measureDescriptionOverflow(); });
    this.descriptionResizeObserver.observe(el);
  }

  private measureDescriptionOverflow() {
    const el = this.descriptionText()?.nativeElement;
    if (!el) { this.descriptionCanExpand.set(false); return; }
    this.descriptionCanExpand.set(el.scrollHeight > el.clientHeight + 1);
  }

  // --- Tags overflow measurement ---

}
