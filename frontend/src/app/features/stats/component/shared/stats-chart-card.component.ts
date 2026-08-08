import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AppMessageComponent } from '../../../../shared/ui/message/app-message.component';

export type StatsChartState = 'ready' | 'empty' | 'error';

let nextHeadingId = 0;

@Component({
  selector: 'app-stats-chart-card',
  standalone: true,
  imports: [AppMessageComponent],
  template: `
    <article
      class="flex h-full min-w-0 flex-col rounded-xl bg-page text-text tabular-nums ring-1 ring-inset ring-border"
      data-stats-chart-card
      [attr.aria-labelledby]="headingId">
        <header [class]="headerClass()">
          <div class="min-w-0 flex-1">
            <h2 [id]="headingId" class="m-0 text-base font-semibold leading-6 text-text-strong">
              {{ heading() }}
            </h2>
            @if (showDescription() && description()) {
              <p class="mt-0.5 text-sm leading-5 text-text-secondary">{{ description() }}</p>
            }
          </div>

          <div [class]="actionsClass()">
            <div class="contents">
              <ng-content select="[statsChartActions]" />
            </div>
          </div>

          @if (sectionedHeader()) {
            <span
              class="pointer-events-none absolute inset-x-4 bottom-0 border-b border-border md:inset-x-5"
              data-chart-header-divider
              aria-hidden="true"></span>
          }
        </header>

        <div [class]="contentClass()">
          @switch (state()) {
            @case ('empty') {
              <div class="flex min-h-56 items-center justify-center px-4 text-center text-text-secondary">
                <p class="max-w-sm text-sm leading-5">{{ emptyMessage() }}</p>
              </div>
            }
            @case ('error') {
              <div class="flex min-h-56 items-center justify-center">
                <app-message color="red" styleClass="max-w-md">
                  {{ errorMessage() }}
                </app-message>
              </div>
            }
            @default {
              <ng-content />
            }
          }
        </div>

        <div class="px-4 pb-4 empty:hidden md:px-5 md:pb-5">
          <ng-content select="[statsChartSummary]" />
        </div>
      </article>
  `,
  styleUrl: './stats-chart-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: '@container block h-full min-w-0' },
})
export class StatsChartCardComponent {
  readonly heading = input.required<string>();
  readonly description = input('');
  readonly showDescription = input(true);
  readonly sectionedHeader = input(false);
  readonly state = input<StatsChartState>('ready');
  readonly emptyMessage = input('No data available');
  readonly errorMessage = input('The chart could not be loaded');

  protected readonly headingId = `stats-chart-heading-${nextHeadingId++}`;
  protected readonly headerClass = computed(() => {
    const base = 'relative flex min-w-0 justify-between gap-3 px-4 pt-4 md:px-5 md:pt-5';
    return this.sectionedHeader()
      ? `${base} items-center pb-4 md:pb-5`
      : `${base} items-start`;
  });
  protected readonly actionsClass = computed(() => {
    const base = 'flex shrink-0 items-center gap-2 empty:hidden';
    return this.sectionedHeader() ? base : `${base} h-6`;
  });
  protected readonly contentClass = computed(() => {
    const base = 'flex min-h-0 min-w-0 flex-1 flex-col justify-center px-2 pb-4 md:px-3 md:pb-5';
    return this.sectionedHeader()
      ? `${base} pt-4 md:pt-5`
      : `${base} pt-3 md:pt-4`;
  });
}
