import {Component, computed, inject, OnInit, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Slider} from 'primeng/slider';
import {Popover} from 'primeng/popover';
import {Paginator} from 'primeng/paginator';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {SeriesDataService} from '../../service/series-data.service';
import {SeriesSummary} from '../../model/series.model';
import {SeriesCardComponent} from '../series-card/series-card.component';
import {BookService} from '../../../book/service/book.service';
import {ReadStatus} from '../../../book/model/book.model';
import {PageTitleService} from '../../../../shared/service/page-title.service';
import {SeriesScalePreferenceService} from '../../service/series-scale-preference.service';
import {Router} from '@angular/router';
import {BrowsePageComponent} from '../../../../shared/components/browse/browse-page.component';
import {BrowseToolbarComponent} from '../../../../shared/components/browse/browse-toolbar.component';
import {BrowseGridComponent} from '../../../../shared/components/browse/browse-grid.component';
import {SpinnerComponent} from '../../../../shared/components/ui/spinner/spinner';

interface SortOption {
  label: string;
  value: string;
}

interface FilterOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-series-browser',
  standalone: true,
  templateUrl: './series-browser.component.html',
  imports: [
    FormsModule,
    Slider,
    Popover,
    Paginator,
    TranslocoDirective,
    SeriesCardComponent,
    BrowsePageComponent,
    BrowseToolbarComponent,
    BrowseGridComponent,
    SpinnerComponent
  ]
})
export class SeriesBrowserComponent implements OnInit {

  private seriesDataService = inject(SeriesDataService);
  private bookService = inject(BookService);
  private pageTitle = inject(PageTitleService);
  private t = inject(TranslocoService);
  private router = inject(Router);
  protected seriesScaleService = inject(SeriesScalePreferenceService);

  readonly isBooksLoading = this.bookService.isBooksLoading;

  readonly searchTerm = signal('');
  readonly statusFilter = signal('all');
  readonly sortBy = signal('name-asc');

  readonly pageFirst = signal(0);
  readonly pageRows = signal(50);

  sortOptions: SortOption[] = [];
  filterOptions: FilterOption[] = [];

  readonly filteredSeries = computed(() => {
    let result = this.seriesDataService.allSeries();

    const search = this.searchTerm().trim().toLowerCase();
    if (search) {
      result = result.filter(series =>
        series.seriesName.toLowerCase().includes(search) ||
        series.authors.some(author => author.toLowerCase().includes(search))
      );
    }

    result = this.applyStatusFilter(result, this.statusFilter());
    return this.applySort(result, this.sortBy());
  });

  readonly pagedSeries = computed(() => {
    const all = this.filteredSeries();
    const start = this.pageFirst();
    return all.slice(start, start + this.pageRows());
  });

  get currentSortLabel(): string {
    const current = this.sortBy();
    return this.sortOptions.find(o => o.value === current)?.label ?? 'Sort';
  }

  get currentFilterLabel(): string {
    const current = this.statusFilter();
    return this.filterOptions.find(o => o.value === current)?.label ?? 'Status';
  }

  get isFilterActive(): boolean {
    return this.statusFilter() !== 'all';
  }

  ngOnInit(): void {
    this.pageTitle.setPageTitle(this.t.translate('seriesBrowser.pageTitle'));

    this.filterOptions = [
      {label: this.t.translate('seriesBrowser.filters.all'), value: 'all'},
      {label: this.t.translate('seriesBrowser.filters.notStarted'), value: 'not-started'},
      {label: this.t.translate('seriesBrowser.filters.inProgress'), value: 'in-progress'},
      {label: this.t.translate('seriesBrowser.filters.completed'), value: 'completed'},
      {label: this.t.translate('seriesBrowser.filters.abandoned'), value: 'abandoned'}
    ];

    this.sortOptions = [
      {label: this.t.translate('seriesBrowser.sort.nameAsc'), value: 'name-asc'},
      {label: this.t.translate('seriesBrowser.sort.nameDesc'), value: 'name-desc'},
      {label: this.t.translate('seriesBrowser.sort.bookCount'), value: 'book-count'},
      {label: this.t.translate('seriesBrowser.sort.progress'), value: 'progress'},
      {label: this.t.translate('seriesBrowser.sort.recentlyRead'), value: 'recently-read'},
      {label: this.t.translate('seriesBrowser.sort.recentlyAdded'), value: 'recently-added'}
    ];
  }

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
    this.pageFirst.set(0);
  }

  onSortChange(value: string): void {
    this.sortBy.set(value);
    this.pageFirst.set(0);
  }

  onStatusFilterChange(value: string): void {
    this.statusFilter.set(value);
    this.pageFirst.set(0);
  }

  clearFilter(): void {
    this.statusFilter.set('all');
    this.pageFirst.set(0);
  }

  onPageChange(event: { first?: number; rows?: number }): void {
    if (event.first != null) this.pageFirst.set(event.first);
    if (event.rows != null) this.pageRows.set(event.rows);
  }

  navigateToSeries(series: SeriesSummary): void {
    this.router.navigate(['/series', series.seriesName]);
  }

  private applyStatusFilter(series: SeriesSummary[], filterValue: string): SeriesSummary[] {
    switch (filterValue) {
      case 'not-started':
        return series.filter(s => s.seriesStatus === ReadStatus.UNREAD);
      case 'in-progress':
        return series.filter(s =>
          s.seriesStatus === ReadStatus.READING ||
          s.seriesStatus === ReadStatus.PARTIALLY_READ
        );
      case 'completed':
        return series.filter(s => s.seriesStatus === ReadStatus.READ);
      case 'abandoned':
        return series.filter(s =>
          s.seriesStatus === ReadStatus.ABANDONED ||
          s.seriesStatus === ReadStatus.WONT_READ
        );
      default:
        return series;
    }
  }

  private applySort(series: SeriesSummary[], sortBy: string): SeriesSummary[] {
    const sorted = [...series];
    switch (sortBy) {
      case 'name-asc':
        return sorted.sort((a, b) => a.seriesName.localeCompare(b.seriesName));
      case 'name-desc':
        return sorted.sort((a, b) => b.seriesName.localeCompare(a.seriesName));
      case 'book-count':
        return sorted.sort((a, b) => b.bookCount - a.bookCount);
      case 'progress':
        return sorted.sort((a, b) => b.progress - a.progress);
      case 'recently-read':
        return sorted.sort((a, b) => {
          const aTime = a.lastReadTime ? new Date(a.lastReadTime).getTime() : 0;
          const bTime = b.lastReadTime ? new Date(b.lastReadTime).getTime() : 0;
          return bTime - aTime;
        });
      case 'recently-added':
        return sorted.sort((a, b) => {
          const aTime = a.addedOn ? new Date(a.addedOn).getTime() : 0;
          const bTime = b.addedOn ? new Date(b.addedOn).getTime() : 0;
          return bTime - aTime;
        });
      default:
        return sorted;
    }
  }
}
