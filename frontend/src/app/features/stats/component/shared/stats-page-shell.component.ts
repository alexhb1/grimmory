import { CdkDrag, CdkDragHandle, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  contentChild,
  ElementRef,
  inject,
  input,
  model,
  TemplateRef,
  viewChild,
} from '@angular/core';
import {
  LucideChevronDown,
  LucideChevronUp,
  LucideEllipsisVertical,
  LucideGripVertical,
  LucideRotateCcw,
  LucideSquarePen,
  LucideX,
  type LucideIconData,
} from '@lucide/angular';

import { AppPageHeaderComponent } from '../../../../shared/layout/page-header/app.page-header.component';
import { type PageHeader } from '../../../../shared/layout/page-header/page-header.service';
import { AppButtonComponent } from '../../../../shared/ui/button/app-button.component';
import { AppMenuCheckboxComponent } from '../../../../shared/ui/menu/app-menu-checkbox.component';
import { AppMenuComponent } from '../../../../shared/ui/menu/app-menu.component';
import { AppMenuContentDirective } from '../../../../shared/ui/menu/app-menu-content.directive';
import { AppMenuItemComponent } from '../../../../shared/ui/menu/app-menu-item.component';
import { AppMenuSeparatorComponent } from '../../../../shared/ui/menu/app-menu-separator.component';
import {
  STATS_CHART_DRAG_START_DELAY,
  type StatsChartGridController,
  type StatsChartLayoutRow,
  type StatsPageChartConfig,
} from './stats-chart-grid.controller';
import { statsChartColumnSpan, type StatsChartColumnSpan } from './stats-chart-layout';

export interface StatsPageShellLabels {
  readonly menu: string;
  readonly showDescriptions: string;
  readonly edit: string;
  readonly resetOrder: string;
  readonly addChart: string;
  readonly done: string;
  readonly chartName: (chart: StatsPageChartConfig) => string;
  readonly reorderChart: (chart: StatsPageChartConfig) => string;
  readonly removeChart: (chart: StatsPageChartConfig) => string;
  readonly moveChartEarlier: (chart: StatsPageChartConfig) => string;
  readonly moveChartLater: (chart: StatsPageChartConfig) => string;
}

export interface StatsPageChartContext {
  readonly $implicit: StatsPageChartConfig;
}

const RESPONSIVE_COLUMN_CLASSES: Readonly<Record<StatsChartColumnSpan, string>> = {
  4: '@2xl:col-span-4',
  6: '@2xl:col-span-6',
  8: '@2xl:col-span-8',
  12: '@2xl:col-span-12',
};

@Component({
  selector: 'app-stats-page-shell',
  standalone: true,
  imports: [
    AppButtonComponent,
    AppMenuCheckboxComponent,
    AppMenuComponent,
    AppMenuContentDirective,
    AppMenuItemComponent,
    AppMenuSeparatorComponent,
    AppPageHeaderComponent,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    CdkDropListGroup,
    LucideChevronDown,
    LucideChevronUp,
    LucideEllipsisVertical,
    LucideGripVertical,
    LucideX,
    NgTemplateOutlet,
  ],
  template: `
    <div class="app-page @container mx-auto w-full max-w-[88rem]">
      <app-page-header [pageHeader]="pageHeader()">
        <ng-content select="[statsPageFilters]" />

        @if (controller().isEditing()) {
          <app-button
            tone="neutral"
            variant="soft"
            size="md"
            [label]="labels().addChart"
            [disabled]="controller().availableCharts().length === 0"
            ariaHasPopup="menu"
            [ariaExpanded]="chartAddMenu()?.isOpen() ? 'true' : 'false'"
            (clicked)="toggleMenu($event, chartAddMenu())">
          </app-button>

          <app-menu #chartAddMenuPanel [ariaLabel]="labels().addChart">
            <ng-template appMenuContent>
              @for (chart of controller().availableCharts(); track chart.id) {
                <app-menu-item (selected)="controller().add(chart.id)">
                  {{ labels().chartName(chart) }}
                </app-menu-item>
              }
            </ng-template>
          </app-menu>

          <app-button
            tone="primary"
            variant="soft"
            size="md"
            [label]="labels().done"
            (clicked)="finishEditing()" />
        }

        <app-button
          class="max-sm:ml-auto [@media((width<=959px)_and_(height<=500px)_and_(pointer:coarse)_and_(hover:none))]:ml-auto"
          variant="ghost"
          size="md"
          iconOnly
          buttonId="stats-page-config-trigger"
          [ariaLabel]="labels().menu"
          ariaHasPopup="menu"
          [ariaExpanded]="chartConfigMenu()?.isOpen() ? 'true' : 'false'"
          (clicked)="toggleMenu($event, chartConfigMenu())">
          <svg lucideEllipsisVertical aria-hidden="true"></svg>
        </app-button>

        <app-menu #chartConfigMenuPanel [ariaLabel]="labels().menu">
          <ng-template appMenuContent>
            <app-menu-checkbox [(checked)]="showDescriptions">
              {{ labels().showDescriptions }}
            </app-menu-checkbox>

            @if (!controller().isEditing()) {
              <app-menu-separator />

              <app-menu-item [icon]="iconEdit" (selected)="controller().startEditing()">
                {{ labels().edit }}
              </app-menu-item>
            }

            <app-menu-separator />

            <app-menu-item [icon]="iconReset" (selected)="controller().resetOrder()">
              {{ labels().resetOrder }}
            </app-menu-item>
          </ng-template>
        </app-menu>
      </app-page-header>

      @if (noticeVisible()) {
        <ng-content select="[statsPageNotice]" />
      }

      <ng-content select="[statsPageSummary]" />

      <div [class.hidden]="emptyNotice()" class="flex flex-col gap-4" cdkDropListGroup>
        @for (row of controller().rows(); track row.id) {
          <div
            class="grid min-w-0 grid-cols-1 gap-4 @2xl:grid-cols-12"
            [attr.data-preview-layout]="controller().previewLayout(row.id)"
            [id]="row.id"
            cdkDropList
            cdkDropListOrientation="mixed"
            [cdkDropListDisabled]="dropListDisabled() || !controller().isEditing()"
            [cdkDropListData]="row.charts"
            (cdkDropListEntered)="controller().previewReorder($event.container.id, $event.currentIndex)"
            (cdkDropListDropped)="controller().reorder($event)">
            @for (chartConfig of row.charts; track chartConfig.id) {
              <div
                class="relative col-span-1 min-w-0 [&.cdk-drag-placeholder>*]:invisible [&.cdk-drag-placeholder]:rounded-xl [&.cdk-drag-placeholder]:border-2 [&.cdk-drag-placeholder]:border-dashed [&.cdk-drag-placeholder]:border-primary [&.cdk-drag-placeholder]:bg-page [&.cdk-drag-placeholder]:opacity-40 [&.cdk-drag-placeholder]:shadow-none [&.cdk-drag-preview]:rounded-xl [&.cdk-drag-preview]:shadow-pop"
                [class]="columnClass(row, chartConfig)"
                [attr.data-chart-size]="chartConfig.size"
                cdkDrag
                [cdkDragDisabled]="!controller().isEditing()"
                [cdkDragStartDelay]="chartDragStartDelay"
                [cdkDragData]="chartConfig"
                (cdkDragStarted)="controller().startReorderPreview(row.id, chartConfig)"
                (cdkDragEnded)="controller().clearReorderPreview()">
                @if (controller().isEditing()) {
                  <div
                    class="absolute inset-x-2 top-2 z-20 flex min-h-10 items-center justify-between gap-3 rounded-lg bg-card/95 px-2 py-1 shadow-control ring-1 ring-inset ring-border backdrop-blur-sm">
                    <span
                      class="flex min-w-0 cursor-grab items-center gap-1.5 rounded-sm px-1 text-sm font-medium text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:cursor-grabbing"
                      cdkDragHandle
                      role="button"
                      tabindex="0"
                      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home End"
                      [attr.aria-label]="labels().reorderChart(chartConfig)"
                      [attr.title]="labels().reorderChart(chartConfig)"
                      [attr.data-chart-reorder-handle]="chartConfig.id"
                      (keydown)="reorderKeydown($event, chartConfig.id)">
                      <svg lucideGripVertical class="size-5 shrink-0" aria-hidden="true"></svg>
                      <span class="truncate">{{ labels().chartName(chartConfig) }}</span>
                    </span>

                    <div class="flex shrink-0 items-center gap-1">
                      <app-button
                        tone="neutral"
                        variant="ghost"
                        size="md"
                        iconOnly
                        [disabled]="controller().isFirst(chartConfig.id)"
                        [ariaLabel]="labels().moveChartEarlier(chartConfig)"
                        [title]="labels().moveChartEarlier(chartConfig)"
                        (clicked)="moveChart(chartConfig.id, -1)">
                        <svg lucideChevronUp aria-hidden="true"></svg>
                      </app-button>
                      <app-button
                        tone="neutral"
                        variant="ghost"
                        size="md"
                        iconOnly
                        [disabled]="controller().isLast(chartConfig.id)"
                        [ariaLabel]="labels().moveChartLater(chartConfig)"
                        [title]="labels().moveChartLater(chartConfig)"
                        (clicked)="moveChart(chartConfig.id, 1)">
                        <svg lucideChevronDown aria-hidden="true"></svg>
                      </app-button>
                      <app-button
                        tone="danger"
                        variant="ghost"
                        size="md"
                        iconOnly
                        [ariaLabel]="labels().removeChart(chartConfig)"
                        [title]="labels().removeChart(chartConfig)"
                        (clicked)="removeChart(chartConfig.id)">
                        <svg lucideX aria-hidden="true"></svg>
                      </app-button>
                    </div>
                  </div>
                }
                <div
                  class="h-full"
                  [class.pointer-events-none]="controller().isEditing()"
                  [attr.inert]="controller().isEditing() ? '' : null">
                  <ng-container
                    [ngTemplateOutlet]="chartTemplate() ?? null"
                    [ngTemplateOutletContext]="{ $implicit: chartConfig }" />
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styleUrl: './stats-page-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class StatsPageShellComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly pageHeader = input.required<PageHeader>();
  readonly controller = input.required<StatsChartGridController>();
  readonly labels = input.required<StatsPageShellLabels>();
  readonly dropListDisabled = input(false);
  readonly noticeVisible = input(false);
  readonly emptyNotice = input(false);
  readonly showDescriptions = model(true);

  protected readonly chartTemplate = contentChild<TemplateRef<StatsPageChartContext>>('chartTemplate');
  protected readonly chartConfigMenu = viewChild<AppMenuComponent>('chartConfigMenuPanel');
  protected readonly chartAddMenu = viewChild<AppMenuComponent>('chartAddMenuPanel');

  protected readonly iconEdit: LucideIconData = LucideSquarePen.icon;
  protected readonly iconReset: LucideIconData = LucideRotateCcw.icon;
  protected readonly chartDragStartDelay = STATS_CHART_DRAG_START_DELAY;

  protected columnClass(
    row: StatsChartLayoutRow,
    chart: StatsPageChartConfig,
  ): string {
    return RESPONSIVE_COLUMN_CLASSES[statsChartColumnSpan(row.charts, chart)];
  }

  protected toggleMenu(event: MouseEvent, menu: AppMenuComponent | undefined): void {
    if (!menu) return;

    const origin = event.currentTarget as HTMLElement;
    if (menu.openerElement() === origin) {
      menu.close();
    } else {
      menu.open(origin);
    }
  }

  protected reorderKeydown(event: KeyboardEvent, chartId: string): void {
    this.controller().reorderKeydown(event, chartId);
    if (event.defaultPrevented) this.restoreChartFocus(chartId);
  }

  protected moveChart(chartId: string, delta: -1 | 1): void {
    this.controller().move(chartId, delta);
    this.restoreChartFocus(chartId);
  }

  protected removeChart(chartId: string): void {
    const chartIds = this.controller().enabledCharts().map(({ id }) => id);
    const index = chartIds.indexOf(chartId);
    const nextChartId = chartIds[index + 1] ?? chartIds[index - 1];
    this.controller().remove(chartId);

    if (nextChartId) {
      this.restoreChartFocus(nextChartId);
    } else {
      this.restoreFocus('#stats-page-config-trigger');
    }
  }

  protected finishEditing(): void {
    this.controller().finishEditing();
    this.restoreFocus('#stats-page-config-trigger');
  }

  private restoreChartFocus(chartId: string): void {
    setTimeout(() => {
      const handles = this.element.nativeElement.querySelectorAll<HTMLElement>(
        '[data-chart-reorder-handle]',
      );
      [...handles].find((handle) => handle.dataset['chartReorderHandle'] === chartId)?.focus();
    });
  }

  private restoreFocus(selector: string): void {
    setTimeout(() => this.element.nativeElement.querySelector<HTMLElement>(selector)?.focus());
  }
}
