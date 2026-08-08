import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import {
  StatsChartCardComponent,
  type StatsChartState,
} from '../../../shared/stats-chart-card.component';
import { readStatsChartThemeColors } from '../../../shared/stats-chart-theme.service';
import {
  BOOK_FLOW_OTHER_QUARTERS_ID,
  type BookFlowColumn,
  type BookFlowNode,
  type BookFlowQuarter,
  type BookFlowRatingId,
  type BookFlowStats,
  type BookFlowStatusId,
} from '../../../../data/user/book-flow-stats';

interface LayoutNode extends BookFlowNode {
  readonly columnIndex: number;
  readonly indexInColumn: number;
  readonly top: number;
  readonly height: number;
}

const COLUMNS: readonly BookFlowColumn[] = ['added', 'status', 'rating'];
const QUARTER_COLORS: readonly string[] = [
  '#42a5f5',
  '#26c6da',
  '#66bb6a',
  '#ffa726',
  '#ab47bc',
  '#ef5350',
  '#ec407a',
  '#7e57c2',
];

const STATUS_COLORS: Readonly<Record<BookFlowStatusId, string>> = {
  read: '#66bb6a',
  reading: '#42a5f5',
  unread: '#78909c',
  paused: '#ffa726',
  abandoned: '#ef5350',
  other: '#ab47bc',
};

const RATING_COLORS: Readonly<Record<BookFlowRatingId, string>> = {
  high: '#66bb6a',
  mid: '#ffc107',
  low: '#ef5350',
  unrated: '#78909c',
};

const STATUS_LABEL_KEYS: Readonly<Record<BookFlowStatusId, string>> = {
  read: 'statsUser.readStatus.read',
  reading: 'statsUser.readStatus.currentlyReading',
  unread: 'statsUser.readStatus.unread',
  paused: 'statsUser.readStatus.paused',
  abandoned: 'statsUser.readStatus.abandoned',
  other: 'statsUser.readStatus.noStatus',
};

const RATING_LABELS: Readonly<Record<Exclude<BookFlowRatingId, 'unrated'>, string>> = {
  high: '4-5',
  mid: '3',
  low: '1-2',
};

const UNKNOWN_LABEL = '—';
const NODE_WIDTH = 18;
const LEFT_MARGIN = 100;
const RIGHT_MARGIN = 130;
const LAYOUT_TOP = 30;
const LAYOUT_BOTTOM = 30;
const LAYOUT_PADDING = 6;
const MINIMUM_NODE_HEIGHT = 10;
const LABEL_LIMIT = 18;

@Component({
  selector: 'app-book-flow-chart',
  standalone: true,
  imports: [StatsChartCardComponent, TranslocoDirective],
  templateUrl: './book-flow-chart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-w-0' },
})
export class BookFlowChartComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLanguage = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('flowCanvas');

  readonly stats = input.required<BookFlowStats>();
  readonly loading = input(false);
  readonly error = input(false);
  readonly loadingMessage = input('Loading chart');
  readonly plotHeight = input(260);
  readonly showDescription = input(true);

  readonly state = computed<StatsChartState>(() => {
    if (this.error()) return 'error';
    if (this.loading()) return 'loading';
    return this.stats().nodes.length > 0 ? 'ready' : 'empty';
  });

  readonly busiestQuarterLabel = computed(() => {
    const quarter = this.stats().busiestQuarter;
    return quarter ? formatQuarter(quarter) : UNKNOWN_LABEL;
  });

  readonly topStatusLabel = computed(() => {
    this.activeLanguage();
    const status = this.stats().topStatus;
    return status ? this.transloco.translate(STATUS_LABEL_KEYS[status]) : UNKNOWN_LABEL;
  });

  private readonly repaint = effect(() => {
    const canvas = this.canvas()?.nativeElement;
    const stats = this.stats();
    const height = this.plotHeight();
    this.activeLanguage();
    if (!canvas || this.loading() || this.state() !== 'ready') return;

    requestAnimationFrame(() => this.draw(canvas, stats, height));
  });

  protected formatCount(value: number): string {
    return value.toLocaleString(this.activeLanguage());
  }

  private draw(canvas: HTMLCanvasElement, stats: BookFlowStats, height: number): void {
    const context = canvas.getContext('2d');
    const parent = canvas.parentElement;
    if (!context || !parent) return;

    const width = parent.getBoundingClientRect().width;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.scale(ratio, ratio);

    const columnX = [LEFT_MARGIN, width * 0.45, width - RIGHT_MARGIN];
    const colors = readStatsChartThemeColors();
    const nodes = layoutNodes(stats.nodes, height);
    const nodesByKey = new Map(nodes.map((node) => [nodeKey(node.column, node.id), node]));

    context.fillStyle = colors.textMuted;
    context.font = '11px Inter, sans-serif';
    context.textAlign = 'center';
    [
      this.transloco.translate('statsUser.bookFlow.colAdded'),
      this.transloco.translate('statsUser.bookFlow.colStatus'),
      this.transloco.translate('statsUser.bookFlow.colRating'),
    ].forEach((header, column) => {
      context.fillText(header, columnX[column] + NODE_WIDTH / 2, 18);
    });

    const sourceOffsets = new Map<string, number>();
    const targetOffsets = new Map<string, number>();

    for (const link of stats.links) {
      const sourceKey = nodeKey(link.sourceColumn, link.sourceId);
      const targetKey = nodeKey(link.targetColumn, link.targetId);
      const source = nodesByKey.get(sourceKey);
      const target = nodesByKey.get(targetKey);
      if (!source || !target) continue;

      const sourceOffset = sourceOffsets.get(sourceKey) ?? 0;
      const targetOffset = targetOffsets.get(targetKey) ?? 0;
      const sourceHeight = Math.max(1, (link.value / source.count) * source.height);
      const targetHeight = Math.max(1, (link.value / target.count) * target.height);
      const sourceX = columnX[source.columnIndex] + NODE_WIDTH;
      const targetX = columnX[target.columnIndex];
      const controlX = (sourceX + targetX) / 2;
      const sourceTop = source.top + sourceOffset;
      const sourceBottom = sourceTop + sourceHeight;
      const targetTop = target.top + targetOffset;
      const targetBottom = targetTop + targetHeight;

      context.beginPath();
      context.moveTo(sourceX, sourceTop);
      context.bezierCurveTo(controlX, sourceTop, controlX, targetTop, targetX, targetTop);
      context.lineTo(targetX, targetBottom);
      context.bezierCurveTo(controlX, targetBottom, controlX, sourceBottom, sourceX, sourceBottom);
      context.closePath();

      const color = this.nodeColor(source);
      context.fillStyle = `${color}55`;
      context.fill();
      context.strokeStyle = `${color}30`;
      context.lineWidth = 0.5;
      context.stroke();

      sourceOffsets.set(sourceKey, sourceOffset + sourceHeight);
      targetOffsets.set(targetKey, targetOffset + targetHeight);
    }

    for (const node of nodes) {
      const x = columnX[node.columnIndex];
      const color = this.nodeColor(node);

      context.fillStyle = color;
      context.globalAlpha = 0.92;
      context.beginPath();
      context.roundRect(x, node.top, NODE_WIDTH, node.height, 3);
      context.fill();
      context.globalAlpha = 1;

      context.strokeStyle = colors.grid;
      context.lineWidth = 1;
      context.beginPath();
      context.roundRect(x, node.top, NODE_WIDTH, node.height, 3);
      context.stroke();

      context.fillStyle = colors.text;
      context.font = '11px Inter, sans-serif';
      context.textAlign = node.columnIndex === 2 ? 'left' : 'right';
      context.textBaseline = 'middle';
      const label = this.nodeLabel(node);
      const truncatedLabel = label.length > LABEL_LIMIT
        ? `${label.slice(0, LABEL_LIMIT - 2)}..`
        : label;
      context.fillText(
        `${truncatedLabel} (${this.formatCount(node.count)})`,
        node.columnIndex === 2 ? x + NODE_WIDTH + 8 : x - 8,
        node.top + node.height / 2,
      );
    }
  }

  private nodeLabel(node: LayoutNode): string {
    switch (node.column) {
      case 'added':
        if (node.id === BOOK_FLOW_OTHER_QUARTERS_ID) {
          return this.transloco.translate('statsUser.bookFlow.statusOther');
        }
        return node.quarter ? formatQuarter(node.quarter) : UNKNOWN_LABEL;
      case 'status':
        return this.transloco.translate(STATUS_LABEL_KEYS[node.id as BookFlowStatusId]);
      case 'rating': {
        const ratingId = node.id as BookFlowRatingId;
        return ratingId === 'unrated'
          ? this.transloco.translate('book.table.noRating')
          : RATING_LABELS[ratingId];
      }
    }
  }

  private nodeColor(node: LayoutNode): string {
    switch (node.column) {
      case 'added':
        return QUARTER_COLORS[node.indexInColumn % QUARTER_COLORS.length];
      case 'status':
        return STATUS_COLORS[node.id as BookFlowStatusId];
      case 'rating':
        return RATING_COLORS[node.id as BookFlowRatingId];
    }
  }
}

function layoutNodes(nodes: readonly BookFlowNode[], height: number): readonly LayoutNode[] {
  return COLUMNS.flatMap((column, columnIndex) => {
    const columnNodes = nodes.filter((node) => node.column === column);
    const total = columnNodes.reduce((sum, node) => sum + node.count, 0);
    const span = height - LAYOUT_TOP - LAYOUT_BOTTOM - columnNodes.length * LAYOUT_PADDING;
    let top = LAYOUT_TOP;

    return columnNodes.map((node, indexInColumn) => {
      const height = Math.max(MINIMUM_NODE_HEIGHT, (node.count / total) * span);
      const layoutNode = { ...node, columnIndex, indexInColumn, top, height };
      top += height + LAYOUT_PADDING;
      return layoutNode;
    });
  });
}

function nodeKey(column: BookFlowColumn, id: string): string {
  return `${column}:${id}`;
}

function formatQuarter(quarter: BookFlowQuarter): string {
  return `${quarter.year} Q${quarter.quarter}`;
}
