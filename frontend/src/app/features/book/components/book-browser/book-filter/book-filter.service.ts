import {computed, inject, Injectable, Signal} from '@angular/core';
import {Book} from '../../../model/book.model';
import {Library} from '../../../model/library.model';
import {Shelf} from '../../../model/shelf.model';
import {MagicShelf} from '../../../../magic-shelf/service/magic-shelf.service';
import {BookService} from '../../../service/book.service';
import {LibraryService} from '../../../service/library.service';
import {BookRuleEvaluatorService} from '../../../../magic-shelf/service/book-rule-evaluator.service';
import {GroupRule} from '../../../../magic-shelf/component/magic-shelf-component';
import {EntityType} from '../book-browser.component';
import {BookFilters, BookFilterValue, Filter, FILTER_CONFIGS, FILTER_EXTRACTORS, FilterType, FilterValue, NUMERIC_ID_FILTER_TYPES, registerLanguageDisplayName, SortMode} from './book-filter.config';
import {filterBooksByFilters} from '../filters/sidebar-filter';
import {ALL_FILTER_OPTION_VALUES, BookFilterMode} from '../../../../settings/user-management/user.service';
import {LanguageResolverService} from '../../../../../shared/service/language-resolver.service';

const MAX_FILTER_ITEMS = 100;

@Injectable({providedIn: 'root'})
export class BookFilterService {
  private readonly bookService = inject(BookService);
  private readonly libraryService = inject(LibraryService);
  private readonly bookRuleEvaluatorService = inject(BookRuleEvaluatorService);
  private readonly languageResolver = inject(LanguageResolverService);

  constructor() {
    registerLanguageDisplayName(raw => this.languageResolver.displayName(raw) || raw);
  }

  createFilterSignals(
    entity: Signal<Library | Shelf | MagicShelf | null>,
    entityType: Signal<EntityType>,
    activeFilters: Signal<BookFilters | null>,
    filterMode: Signal<BookFilterMode>
  ): Record<FilterType, Signal<Filter[]>> {
    const filteredBooks = computed(() =>
      this.filterBooksByEntity(this.bookService.books(), entity(), entityType())
    );

    const signals = {} as Record<FilterType, Signal<Filter[]>>;

    for (const filterType of ALL_FILTER_OPTION_VALUES) {
      if (filterType === 'library') continue;
      const config = FILTER_CONFIGS[filterType];
      signals[filterType] = computed(() => {
        const books = filterBooksByFilters(filteredBooks(), activeFilters(), filterMode(), filterType);
        return this.buildAndSortFilters(books, FILTER_EXTRACTORS[filterType], config.sortMode);
      });
    }

    signals.library = computed(() => {
      const books = filterBooksByFilters(filteredBooks(), activeFilters(), filterMode(), 'library');
      const libraries = this.libraryService.libraries();

      const libraryMap = new Map(
        libraries
          .filter(lib => lib.id !== undefined)
          .map(lib => [lib.id!, lib.name])
      );

      const filterMap = new Map<number, Filter>();

      for (const book of books) {
        if (book.libraryId == null) continue;

        if (!filterMap.has(book.libraryId)) {
          filterMap.set(book.libraryId, {
            value: {
              id: book.libraryId,
              name: libraryMap.get(book.libraryId) ?? book.libraryName ?? `Library ${book.libraryId}`
            },
            bookCount: 0
          });
        }
        filterMap.get(book.libraryId)!.bookCount++;
      }

      return this.sortFiltersByCount(Array.from(filterMap.values()));
    });

    return signals;
  }

  filterBooksByEntity(
    books: Book[],
    entity: Library | Shelf | MagicShelf | null,
    entityType: EntityType
  ): Book[] {
    if (!entity) return books;

    switch (entityType) {
      case EntityType.LIBRARY:
        return 'paths' in entity ? books.filter(book => book.libraryId === entity.id) : books;

      case EntityType.SHELF:
        return !('paths' in entity) && !('filterJson' in entity)
          ? books.filter(book => book.shelves?.some(shelf => shelf.id === entity.id))
          : books;

      case EntityType.MAGIC_SHELF:
        return 'filterJson' in entity ? this.filterByMagicShelf(books, entity) : books;

      case EntityType.UNSHELVED:
        return books.filter(book => !book.shelves || book.shelves.length === 0);

      default:
        return books;
    }
  }

  processFilterValue(key: string, value: BookFilterValue): BookFilterValue {
    if (NUMERIC_ID_FILTER_TYPES.has(key) && typeof value === 'string') {
      return Number(value);
    }
    return value;
  }

  isNumericFilter(filterType: string): boolean {
    return NUMERIC_ID_FILTER_TYPES.has(filterType);
  }

  private buildAndSortFilters(
    books: Book[],
    extractor: (book: Book) => FilterValue[],
    sortMode: SortMode
  ): Filter[] {
    const filterMap = new Map<unknown, Filter>();

    for (const book of books) {
      for (const item of extractor(book)) {
        const id = item.id;
        if (!filterMap.has(id)) {
          filterMap.set(id, {value: item, bookCount: 0});
        }
        filterMap.get(id)!.bookCount++;
      }
    }

    const filters = Array.from(filterMap.values());
    const sorted = sortMode === 'sortIndex'
      ? this.sortFiltersBySortIndex(filters)
      : this.sortFiltersByCount(filters);

    return sorted.slice(0, MAX_FILTER_ITEMS);
  }

  private sortFiltersByCount(filters: Filter[]): Filter[] {
    return filters.sort((a, b) => {
      if (b.bookCount !== a.bookCount) return b.bookCount - a.bookCount;
      return this.compareNames(a, b);
    });
  }

  private sortFiltersBySortIndex(filters: Filter[]): Filter[] {
    return filters.sort((a, b) => {
      const aIndex = a.value.sortIndex ?? 999;
      const bIndex = b.value.sortIndex ?? 999;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return this.compareNames(a, b);
    });
  }

  private compareNames(a: Filter, b: Filter): number {
    const aName = a.value.name;
    const bName = b.value.name;
    return aName.localeCompare(bName);
  }

  private filterByMagicShelf(books: Book[], magicShelf: MagicShelf): Book[] {
    if (!magicShelf.filterJson) return [];
    try {
      const groupRule = JSON.parse(magicShelf.filterJson) as GroupRule;
      return books.filter(book => this.bookRuleEvaluatorService.evaluateGroup(book, groupRule, books));
    } catch {
      console.warn('Invalid filterJson for MagicShelf');
      return [];
    }
  }
}
