import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { type PageHeader } from '../../../../shared/layout/page-header/page-header.service';
import { PageTitleService } from '../../../../shared/service/page-title.service';
import { AppMessageComponent } from '../../../../shared/ui/message/app-message.component';
import { AppSelectComponent } from '../../../../shared/ui/select/app-select.component';
import { type SelectOption } from '../../../../shared/ui/select/app-select.options';
import {
  StatsChartGridController,
  type StatsPageChartConfig,
} from '../shared/stats-chart-grid.controller';
import {
  StatsPageShellComponent,
  type StatsPageShellLabels,
} from '../shared/stats-page-shell.component';
import { AllBooksStatsSourceService } from '../shared/all-books-stats-source.service';
import { AuthorUniverseChartComponent } from './charts/author-universe-chart/author-universe-chart.component';
import { BookFormatsChartComponent } from './charts/book-formats-chart/book-formats-chart.component';
import { LanguageChartComponent } from './charts/language-chart/language-chart.component';
import { MetadataScoreChartComponent } from './charts/metadata-score-chart/metadata-score-chart.component';
import { PageCountChartComponent } from './charts/page-count-chart/page-count-chart.component';
import { PublicationTimelineChartComponent } from './charts/publication-timeline-chart/publication-timeline-chart.component';
import { PublicationTrendChartComponent } from './charts/publication-trend-chart/publication-trend-chart.component';
import { ReadingJourneyChartComponent } from './charts/reading-journey-chart/reading-journey-chart.component';
import { TopItemsChartComponent } from './charts/top-items-chart/top-items-chart.component';
import {
  type LibraryOption,
  LibraryStatsDataService,
} from './library-stats-data.service';

const DEFAULT_CHARTS: readonly StatsPageChartConfig[] = [
  { id: 'bookFormats', nameKey: 'chartNames.bookFormats', size: 'small' },
  { id: 'languageDistribution', nameKey: 'chartNames.languages', size: 'small' },
  { id: 'metadataScore', nameKey: 'chartNames.metadataScore', size: 'small' },
  { id: 'pageCountDistribution', nameKey: 'chartNames.pageCount', size: 'medium' },
  { id: 'publicationTimeline', nameKey: 'chartNames.publicationTimeline', size: 'medium' },
  { id: 'readingJourney', nameKey: 'chartNames.readingJourney', size: 'wide' },
  { id: 'authorUniverse', nameKey: 'chartNames.authorUniverse', size: 'wide' },
  { id: 'topItems', nameKey: 'chartNames.topItems', size: 'full' },
  { id: 'publicationTrend', nameKey: 'chartNames.publicationTrend', size: 'full' },
];

@Component({
  selector: 'app-library-stats',
  standalone: true,
  imports: [
    AppMessageComponent,
    AppSelectComponent,
    AuthorUniverseChartComponent,
    BookFormatsChartComponent,
    LanguageChartComponent,
    MetadataScoreChartComponent,
    PageCountChartComponent,
    PublicationTimelineChartComponent,
    PublicationTrendChartComponent,
    ReadingJourneyChartComponent,
    StatsPageShellComponent,
    TopItemsChartComponent,
    TranslocoDirective,
    TranslocoPipe,
  ],
  providers: [
    AllBooksStatsSourceService,
    LibraryStatsDataService,
  ],
  templateUrl: './library-stats.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class LibraryStatsComponent implements OnInit {
  private readonly transloco = inject(TranslocoService);
  private readonly pageTitle = inject(PageTitleService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly statsData = inject(LibraryStatsDataService);
  readonly isLoading = this.statsData.statsLoading;
  readonly statsError = this.statsData.statsError;
  readonly hasData = computed(() => this.statsData.summaryStats().totalBooks > 0);
  readonly libraryOptions = this.statsData.libraryOptions;
  readonly librarySelectOptions = computed<readonly SelectOption<LibraryOption>[]>(() =>
    this.libraryOptions().map((option) => ({ label: option.name, value: option })),
  );
  readonly selectedLibrary = computed<LibraryOption | null>(() => {
    const options = this.libraryOptions();
    if (options.length === 0) return null;

    const selectedId = this.statsData.selectedLibrary();
    return options.find((option) => option.id === selectedId) ?? options[0];
  });
  readonly pageHeader = computed<PageHeader>(() => {
    this.activeLanguage();
    return { title: this.transloco.translate('statsLibrary.main.title') };
  });

  readonly chartGrid = new StatsChartGridController({
    storageKey: 'libraryStatsChartConfigV3',
    defaults: DEFAULT_CHARTS,
    label: (chart) => this.transloco.translate(`statsLibrary.${chart.nameKey}`),
  });
  readonly showChartDescriptions = signal(true);
  readonly shellLabels = computed<StatsPageShellLabels>(() => {
    this.activeLanguage();
    const chartName = (chart: StatsPageChartConfig) =>
      this.transloco.translate(`statsLibrary.${chart.nameKey}`);
    return {
      menu: this.transloco.translate('statsLibrary.config.title'),
      showDescriptions: this.transloco.translate('statsLibrary.config.showDescriptions'),
      edit: this.transloco.translate('statsLibrary.config.edit'),
      resetOrder: this.transloco.translate('statsLibrary.config.resetOrder'),
      addChart: this.transloco.translate('statsLibrary.config.addChart'),
      done: this.transloco.translate('statsLibrary.config.done'),
      chartName,
      reorderChart: (chart) =>
        `${chartName(chart)}: ${this.transloco.translate('statsLibrary.main.dragToReorder')}`,
      removeChart: (chart) =>
        `${this.transloco.translate('statsLibrary.config.removeChart')}: ${chartName(chart)}`,
      moveChartEarlier: (chart) => this.transloco.translate(
        'statsLibrary.config.moveChartEarlier',
        { name: chartName(chart) },
      ),
      moveChartLater: (chart) => this.transloco.translate(
        'statsLibrary.config.moveChartLater',
        { name: chartName(chart) },
      ),
    };
  });

  ngOnInit(): void {
    this.pageTitle.setPageTitle(this.transloco.translate('statsLibrary.main.title'));
  }

  onLibraryChange(selectedLibrary: LibraryOption | null): void {
    if (selectedLibrary) this.statsData.setSelectedLibrary(selectedLibrary.id);
  }

  protected formatSizeKb(sizeKb: number): string {
    if (sizeKb >= 1024 * 1024) return `${(sizeKb / (1024 * 1024)).toFixed(2)} GB`;
    if (sizeKb >= 1024) return `${(sizeKb / 1024).toFixed(2)} MB`;
    return `${sizeKb} KB`;
  }
}
