import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { type PageHeader } from '../../../../shared/layout/page-header/page-header.service';
import { PageTitleService } from '../../../../shared/service/page-title.service';
import { AppMessageComponent } from '../../../../shared/ui/message/app-message.component';
import { UserService } from '../../../settings/user-management/user.service';
import {
  StatsChartGridController,
  type StatsPageChartConfig,
} from '../shared/stats-chart-grid.controller';
import {
  StatsPageShellComponent,
  type StatsPageShellLabels,
} from '../shared/stats-page-shell.component';
import { AllBooksStatsSourceService } from '../shared/all-books-stats-source.service';
import { UserStatsDataService } from './user-stats-data.service';
import { BookFlowChartComponent } from './charts/book-flow-chart/book-flow-chart.component';
import { BookLengthChartComponent } from './charts/book-length-chart/book-length-chart.component';
import { CompletionRaceChartComponent } from './charts/completion-race-chart/completion-race-chart.component';
import { CompletionTimelineChartComponent } from './charts/completion-timeline-chart/completion-timeline-chart.component';
import { FavoriteDaysChartComponent } from './charts/favorite-days-chart/favorite-days-chart.component';
import { GenreStatsChartComponent } from './charts/genre-stats-chart/genre-stats-chart.component';
import { PageTurnerChartComponent } from './charts/page-turner-chart/page-turner-chart.component';
import { PeakHoursChartComponent } from './charts/peak-hours-chart/peak-hours-chart.component';
import { PersonalRatingChartComponent } from './charts/personal-rating-chart/personal-rating-chart.component';
import { PublicationEraChartComponent } from './charts/publication-era-chart/publication-era-chart.component';
import { RatingTasteChartComponent } from './charts/rating-taste-chart/rating-taste-chart.component';
import { ReadStatusChartComponent } from './charts/read-status-chart/read-status-chart.component';
import { ReadingDNAChartComponent } from './charts/reading-dna-chart/reading-dna-chart.component';
import { ReadingDebtChartComponent } from './charts/reading-debt-chart/reading-debt-chart.component';
import { ReadingHabitsChartComponent } from './charts/reading-habits-chart/reading-habits-chart.component';
import { ReadingHeatmapChartComponent } from './charts/reading-heatmap-chart/reading-heatmap-chart.component';
import { ReadingProgressChartComponent } from './charts/reading-progress-chart/reading-progress-chart.component';
import { ReadingSessionHeatmapComponent } from './charts/reading-session-heatmap/reading-session-heatmap.component';
import { ReadingSessionTimelineComponent } from './charts/reading-session-timeline/reading-session-timeline.component';
import { ReadingSurvivalChartComponent } from './charts/reading-survival-chart/reading-survival-chart.component';
import { ReadingClockChartComponent } from './charts/reading-clock-chart/reading-clock-chart.component';
import { SeriesProgressChartComponent } from './charts/series-progress-chart/series-progress-chart.component';
import { SessionArchetypesChartComponent } from './charts/session-archetypes-chart/session-archetypes-chart.component';

const DEFAULT_CHARTS: readonly StatsPageChartConfig[] = [
  { id: 'heatmap', nameKey: 'chartNames.heatmap', size: 'full' },
  { id: 'favorite-days', nameKey: 'chartNames.favoriteDays', size: 'medium' },
  { id: 'peak-hours', nameKey: 'chartNames.peakHours', size: 'medium' },
  { id: 'timeline', nameKey: 'chartNames.timeline', size: 'full' },
  { id: 'personal-rating', nameKey: 'chartNames.personalRating', size: 'small' },
  { id: 'reading-progress', nameKey: 'chartNames.readingProgress', size: 'small' },
  { id: 'read-status', nameKey: 'chartNames.readStatus', size: 'small' },
  { id: 'genre-stats', nameKey: 'chartNames.genreStats', size: 'full' },
  { id: 'reading-heatmap', nameKey: 'chartNames.readingHeatmap', size: 'medium' },
  { id: 'completion-timeline', nameKey: 'chartNames.completionTimeline', size: 'medium' },
  { id: 'reading-clock', nameKey: 'chartNames.readingClock', size: 'medium' },
  { id: 'page-turner', nameKey: 'chartNames.pageTurner', size: 'medium' },
  { id: 'reading-survival', nameKey: 'chartNames.readingSurvival', size: 'medium' },
  { id: 'book-length', nameKey: 'chartNames.bookLength', size: 'medium' },
  { id: 'completion-race', nameKey: 'chartNames.completionRace', size: 'full' },
  { id: 'rating-taste', nameKey: 'chartNames.ratingTaste', size: 'medium' },
  { id: 'reading-debt', nameKey: 'chartNames.readingDebt', size: 'medium' },
  { id: 'series-progress', nameKey: 'chartNames.seriesProgress', size: 'full' },
  { id: 'publication-era', nameKey: 'chartNames.publicationEra', size: 'medium' },
  { id: 'session-archetypes', nameKey: 'chartNames.sessionArchetypes', size: 'medium' },
  { id: 'book-flow', nameKey: 'chartNames.bookFlow', size: 'full' },
  { id: 'reading-habits', nameKey: 'chartNames.readingHabits', size: 'medium' },
  { id: 'reading-dna', nameKey: 'chartNames.readingDna', size: 'medium' },
];

@Component({
  selector: 'app-user-stats',
  standalone: true,
  imports: [
    AppMessageComponent,
    BookFlowChartComponent,
    BookLengthChartComponent,
    CompletionRaceChartComponent,
    CompletionTimelineChartComponent,
    FavoriteDaysChartComponent,
    GenreStatsChartComponent,
    PageTurnerChartComponent,
    PeakHoursChartComponent,
    PersonalRatingChartComponent,
    PublicationEraChartComponent,
    RatingTasteChartComponent,
    ReadStatusChartComponent,
    ReadingClockChartComponent,
    ReadingDNAChartComponent,
    ReadingDebtChartComponent,
    ReadingHabitsChartComponent,
    ReadingHeatmapChartComponent,
    ReadingProgressChartComponent,
    ReadingSessionHeatmapComponent,
    ReadingSessionTimelineComponent,
    ReadingSurvivalChartComponent,
    SeriesProgressChartComponent,
    SessionArchetypesChartComponent,
    StatsPageShellComponent,
    TranslocoDirective,
    TranslocoPipe,
  ],
  providers: [AllBooksStatsSourceService, UserStatsDataService],
  templateUrl: './user-stats.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class UserStatsComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly transloco = inject(TranslocoService);
  private readonly pageTitle = inject(PageTitleService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly statsData = inject(UserStatsDataService);
  readonly userName = computed(() => {
    const user = this.userService.currentUser();
    return user ? user.name || user.username : '';
  });
  readonly pageHeader = computed<PageHeader>(() => {
    this.activeLanguage();
    return {
      title: this.transloco.translate('statsUser.main.title', { name: this.userName() }),
    };
  });

  readonly chartGrid = new StatsChartGridController({
    storageKey: 'userStatsChartConfig',
    defaults: DEFAULT_CHARTS,
    label: (chart) => this.transloco.translate(`statsUser.${chart.nameKey}`),
  });
  readonly showChartDescriptions = signal(true);
  readonly shellLabels = computed<StatsPageShellLabels>(() => {
    this.activeLanguage();
    const chartName = (chart: StatsPageChartConfig) =>
      this.transloco.translate(`statsUser.${chart.nameKey}`);
    return {
      menu: this.transloco.translate('statsUser.config.title'),
      showDescriptions: this.transloco.translate('statsUser.config.showDescriptions'),
      edit: this.transloco.translate('statsUser.config.edit'),
      resetOrder: this.transloco.translate('statsUser.config.resetOrder'),
      addChart: this.transloco.translate('statsUser.config.addChart'),
      done: this.transloco.translate('statsUser.config.done'),
      chartName,
      reorderChart: (chart) =>
        `${chartName(chart)}: ${this.transloco.translate('statsUser.main.dragToReorder')}`,
      removeChart: (chart) =>
        `${this.transloco.translate('statsUser.config.removeChart')}: ${chartName(chart)}`,
      moveChartEarlier: (chart) => this.transloco.translate(
        'statsUser.config.moveChartEarlier',
        { name: chartName(chart) },
      ),
      moveChartLater: (chart) => this.transloco.translate(
        'statsUser.config.moveChartLater',
        { name: chartName(chart) },
      ),
    };
  });

  ngOnInit(): void {
    this.pageTitle.setPageTitle(this.transloco.translate('statsUser.main.titleBarTitle'));
  }
}
