import {Component, computed, effect, inject, OnInit, signal} from '@angular/core';
import {RouterLink, RouterLinkActive} from '@angular/router';
import {NavItemComponent} from '../nav-item/nav-item.component';
import {NavSectionComponent} from '../nav-section/nav-section.component';
import {LibraryService} from '../../../../features/book/service/library.service';
import {ShelfService} from '../../../../features/book/service/shelf.service';
import {BookService} from '../../../../features/book/service/book.service';
import {MagicShelfService} from '../../../../features/magic-shelf/service/magic-shelf.service';
import {SeriesDataService} from '../../../../features/series-browser/service/series-data.service';
import {AuthorService} from '../../../../features/author-browser/service/author.service';
import {UserService} from '../../../../features/settings/user-management/user.service';
import {AuthService} from '../../../service/auth.service';
import {AppVersion, VersionService} from '../../../service/version.service';
import {LibraryShelfMenuService} from '../../../../features/book/service/library-shelf-menu.service';
import {GlobalSearchService} from '../global-search/global-search.service';
import {ModalService} from '../../../components/ui/modal/modal.service';
import {LibraryCreatorComponent} from '../../../../features/library-creator/library-creator.component';
import {ThemeSettingsModalComponent} from '../../../components/theme-settings-modal/theme-settings-modal.component';
import {MagicShelfComponent} from '../../../../features/magic-shelf/component/magic-shelf-component';
import {ShelfCreatorComponent} from '../../../../features/book/components/shelf-creator/shelf-creator.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [NavItemComponent, NavSectionComponent, RouterLink, RouterLinkActive],
  templateUrl: './app.sidebar.component.html',
})
export class AppSidebarComponent implements OnInit {
  private libraryService = inject(LibraryService);
  private shelfService = inject(ShelfService);
  private bookService = inject(BookService);
  private magicShelfService = inject(MagicShelfService);
  private seriesDataService = inject(SeriesDataService);
  private authorService = inject(AuthorService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private versionService = inject(VersionService);
  private libraryShelfMenuService = inject(LibraryShelfMenuService);
  private globalSearch = inject(GlobalSearchService);
  private modalService = inject(ModalService);
  toolsOpen = false;
  versionInfo: AppVersion | null = null;
  readonly searchShortcut = this.getShortcutHint();

  readonly currentUser = this.userService.currentUser;

  // Sort preferences
  private librarySortField = signal<'name' | 'id'>('name');
  private librarySortOrder = signal<'asc' | 'desc'>('desc');
  private shelfSortField = signal<'name' | 'id'>('name');
  private shelfSortOrder = signal<'asc' | 'desc'>('asc');
  private magicShelfSortField = signal<'name' | 'id'>('name');
  private magicShelfSortOrder = signal<'asc' | 'desc'>('asc');

  // Counts
  readonly totalBookCount = computed(() => this.bookService.books().length);
  readonly totalSeriesCount = computed(() => this.seriesDataService.allSeries().length);
  readonly totalAuthorCount = computed(() => this.authorService.allAuthors()?.length ?? 0);

  readonly libraryBookCounts = computed(() => {
    const counts = new Map<number, number>();
    for (const book of this.bookService.books()) {
      if (book.libraryId != null) {
        counts.set(book.libraryId, (counts.get(book.libraryId) ?? 0) + 1);
      }
    }
    return counts;
  });

  readonly shelfBookCounts = computed(() => {
    const currentUserId = this.currentUser()?.id;
    const counts = new Map<number, number>();
    let unshelvedCount = 0;

    for (const book of this.bookService.books()) {
      if (!book.shelves || book.shelves.length === 0) {
        unshelvedCount++;
      } else {
        for (const shelf of book.shelves) {
          if (shelf.id != null) {
            counts.set(shelf.id, (counts.get(shelf.id) ?? 0) + 1);
          }
        }
      }
    }

    for (const shelf of this.shelfService.shelves()) {
      if (shelf.userId !== currentUserId && shelf.id != null) {
        counts.set(shelf.id, shelf.bookCount || 0);
      }
    }

    counts.set(-1, unshelvedCount);
    return counts;
  });

  readonly magicShelfBookCounts = computed(() => {
    const counts = new Map<number, number>();
    for (const shelf of this.magicShelfService.shelves()) {
      if (shelf.id != null) {
        counts.set(shelf.id, this.magicShelfService.getBookCountValue(shelf.id));
      }
    }
    return counts;
  });

  // Sorted lists
  readonly sortedLibraries = computed(() =>
    this.sortArray(this.libraryService.libraries(), this.librarySortField(), this.librarySortOrder())
  );

  readonly sortedShelves = computed(() => {
    const sorted = this.sortArray(this.shelfService.shelves(), this.shelfSortField(), this.shelfSortOrder());
    // Move Kobo shelf to end if present
    const koboIdx = sorted.findIndex(s => s.name === 'Kobo');
    if (koboIdx !== -1) {
      const [kobo] = sorted.splice(koboIdx, 1);
      sorted.push(kobo);
    }
    return sorted;
  });

  readonly sortedMagicShelves = computed(() =>
    this.sortArray(this.magicShelfService.shelves(), this.magicShelfSortField(), this.magicShelfSortOrder())
  );

  // Entity menus
  getLibraryMenu(library: any): any[] {
    return this.libraryShelfMenuService.initializeLibraryMenuItems(library);
  }

  getShelfMenu(shelf: any): any[] {
    return this.libraryShelfMenuService.initializeShelfMenuItems(shelf);
  }

  getMagicShelfMenu(shelf: any): any[] {
    return this.libraryShelfMenuService.initializeMagicShelfMenuItems(shelf);
  }

  // Permissions
  readonly canManageLibrary = computed(() => {
    const user = this.currentUser();
    return user?.permissions?.canManageLibrary || user?.permissions?.admin || false;
  });

  readonly canAccessBookdrop = computed(() => {
    const user = this.currentUser();
    return user?.permissions?.canAccessBookdrop || user?.permissions?.admin || false;
  });

  readonly canUpload = computed(() => {
    const user = this.currentUser();
    return user?.permissions?.canUpload || user?.permissions?.admin || false;
  });

  readonly hasStatsAccess = computed(() => {
    const user = this.currentUser();
    return user?.permissions?.canAccessLibraryStats || user?.permissions?.canAccessUserStats || user?.permissions?.admin || false;
  });

  readonly statsRoute = computed(() => {
    const user = this.currentUser();
    if (user?.permissions?.canAccessLibraryStats || user?.permissions?.admin) return '/library-stats';
    if (user?.permissions?.canAccessUserStats) return '/reading-stats';
    return '/library-stats';
  });

  readonly userInitial = computed(() => {
    const user = this.currentUser();
    return user?.username?.charAt(0).toUpperCase() ?? '?';
  });

  // Sync sort preferences from user settings
  private readonly syncSortEffect = effect(() => {
    const user = this.currentUser();
    if (!user) return;

    if (user.userSettings.sidebarLibrarySorting) {
      this.librarySortField.set(user.userSettings.sidebarLibrarySorting.field === 'id' ? 'id' : 'name');
      this.librarySortOrder.set(user.userSettings.sidebarLibrarySorting.order === 'desc' ? 'desc' : 'asc');
    }
    if (user.userSettings.sidebarShelfSorting) {
      this.shelfSortField.set(user.userSettings.sidebarShelfSorting.field === 'id' ? 'id' : 'name');
      this.shelfSortOrder.set(user.userSettings.sidebarShelfSorting.order === 'desc' ? 'desc' : 'asc');
    }
    if (user.userSettings.sidebarMagicShelfSorting) {
      this.magicShelfSortField.set(user.userSettings.sidebarMagicShelfSorting.field === 'id' ? 'id' : 'name');
      this.magicShelfSortOrder.set(user.userSettings.sidebarMagicShelfSorting.order === 'desc' ? 'desc' : 'asc');
    }
  });

  ngOnInit(): void {
    this.versionService.getVersion().subscribe(data => {
      this.versionInfo = data;
    });
  }

  createLibrary(): void {
    this.modalService.open(LibraryCreatorComponent, {title: 'New Library', size: 'md', height: '85vh'});
  }

  createMagicShelf(): void {
    this.modalService.open(MagicShelfComponent, {title: 'New Magic Shelf', size: 'xl', height: '85vh'});
  }

  createShelf(): void {
    this.modalService.open(ShelfCreatorComponent, {title: 'New Shelf', size: 'sm'});
  }

  openProfile(): void {
    // TODO: migrate to ModalService
  }

  openUploadDialog(): void {
    // TODO: migrate to ModalService
  }

  openThemeSettings(): void {
    this.modalService.open(ThemeSettingsModalComponent, { title: 'Appearance', size: 'sm' });
  }

  logout(): void {
    this.authService.logout();
  }

  openGlobalSearch(): void {
    this.globalSearch.open();
  }

  private sortArray<T extends { name?: string | null; id?: number | null }>(
    items: T[],
    field: 'name' | 'id',
    order: 'asc' | 'desc'
  ): T[] {
    const sorted = [...items].sort((a, b) => {
      if (field === 'id') return (a.id ?? 0) - (b.id ?? 0);
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
    return order === 'desc' ? sorted.reverse() : sorted;
  }

  private getShortcutHint(): string {
    if (typeof navigator === 'undefined') {
      return 'Ctrl+K';
    }

    return /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl+K';
  }
}
