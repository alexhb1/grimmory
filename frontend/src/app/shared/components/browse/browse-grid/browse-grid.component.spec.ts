import {Component, signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {provideRouter} from '@angular/router';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {getTranslocoModule} from '../../../../core/testing/transloco-testing';
import {AppButtonComponent} from '../../../ui/button/app-button.component';
import {BrowseGridComponent, type BrowseGridStatus} from './browse-grid.component';
import {BrowseGridViewportComponent, type BrowseGridVisibleRange} from './browse-grid-viewport.component';
import {BrowseGridEmptyDef, BrowseGridItemDef, BrowseGridSkeletonDef} from './browse-grid.directives';
import {skeletonFillCount} from './browse-grid.util';

@Component({
  standalone: true,
  imports: [BrowseGridComponent, BrowseGridItemDef, BrowseGridSkeletonDef, BrowseGridEmptyDef],
  template: `
    <app-browse-grid
      [items]="items()"
      [totalCount]="totalCount()"
      [status]="status()"
      [nextPageError]="nextPageError()"
      [estimateItemHeight]="estimate"
      (visibleRange)="visibleRange = $event"
      (retryInitial)="retryInitial = retryInitial + 1"
      (retryNextPage)="retryNextPage = retryNextPage + 1">
      <ng-template [appBrowseGridItemOf]="items()" let-item>
        <div class="cell">{{ item }}</div>
      </ng-template>
      <ng-template appBrowseGridSkeleton>
        <div class="skeleton"></div>
      </ng-template>
      <ng-template appBrowseGridEmpty>
        <div class="empty">Nothing here</div>
      </ng-template>
    </app-browse-grid>
  `,
})
class HostComponent {
  readonly items = signal<readonly (number | undefined)[]>([]);
  readonly totalCount = signal<number | null>(null);
  readonly status = signal<BrowseGridStatus>('pending');
  readonly nextPageError = signal(false);
  readonly estimate = (): number => 100;
  retryInitial = 0;
  retryNextPage = 0;
  visibleRange: BrowseGridVisibleRange | null = null;
}

describe('BrowseGridComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  function grid(): BrowseGridComponent<number> {
    return fixture.debugElement.query(By.directive(BrowseGridComponent))
      .componentInstance as BrowseGridComponent<number>;
  }

  function viewState(): string {
    return (grid() as unknown as {viewState: () => string})['viewState']();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent, getTranslocoModule()],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('holds blank then reveals the skeleton only after the 180ms delay', () => {
    vi.useFakeTimers();
    host.status.set('pending');
    host.items.set([]);
    fixture.detectChanges();

    expect(viewState()).toBe('idle');

    vi.advanceTimersByTime(179);
    expect(viewState()).toBe('idle');

    vi.advanceTimersByTime(1);
    expect(viewState()).toBe('skeleton');
  });

  it('flushes the skeleton immediately when items arrive', () => {
    vi.useFakeTimers();
    host.status.set('pending');
    host.items.set([]);
    fixture.detectChanges();
    vi.advanceTimersByTime(180);
    expect(viewState()).toBe('skeleton');

    host.items.set([1, 2, 3]);
    host.status.set('success');
    fixture.detectChanges();
    expect(viewState()).toBe('grid');
  });

  it('treats an all-undefined sparse array as having no loaded items', () => {
    vi.useFakeTimers();
    host.status.set('pending');
    host.items.set(new Array<number | undefined>(100));
    fixture.detectChanges();

    expect(viewState()).toBe('idle');
    vi.advanceTimersByTime(180);
    expect(viewState()).toBe('skeleton');
  });

  it('never re-shows the skeleton on a refetch that keeps items', () => {
    host.items.set([1, 2]);
    host.status.set('success');
    fixture.detectChanges();
    expect(viewState()).toBe('grid');

    host.status.set('pending');
    fixture.detectChanges();
    expect(viewState()).toBe('grid');
  });

  it('shows the empty template on success with no items', () => {
    host.status.set('success');
    host.items.set([]);
    host.totalCount.set(0);
    fixture.detectChanges();

    expect(viewState()).toBe('empty');
    expect((fixture.nativeElement as HTMLElement).querySelector('.empty')).not.toBeNull();
  });

  it('keeps a successful non-empty sparse result in the grid state', () => {
    host.status.set('success');
    host.items.set(new Array<number | undefined>(100));
    host.totalCount.set(100);
    fixture.detectChanges();

    expect(viewState()).toBe('grid');
  });

  it('shows the shared book error state and emits retryInitial', () => {
    host.status.set('error');
    host.items.set([]);
    fixture.detectChanges();

    expect(viewState()).toBe('initial-error');
    expect((fixture.nativeElement as HTMLElement).textContent)
      .toContain("We couldn't load these books.");
    const appButton = fixture.debugElement.query(By.directive(AppButtonComponent));
    expect(appButton).not.toBeNull();
    (appButton.nativeElement as HTMLElement).querySelector('button')!.click();
    expect(host.retryInitial).toBe(1);
  });

  it('shows a next-page retry row and emits retryNextPage', () => {
    host.items.set([1, 2, 3]);
    host.status.set('success');
    host.nextPageError.set(true);
    fixture.detectChanges();

    expect(viewState()).toBe('grid');
    const appButton = fixture.debugElement.query(By.directive(AppButtonComponent));
    expect(appButton).not.toBeNull();
    (appButton.nativeElement as HTMLElement).querySelector('button')!.click();
    expect(host.retryNextPage).toBe(1);
  });

  it('forwards the viewport visible range', () => {
    host.items.set([1, 2, 3]);
    host.totalCount.set(3);
    host.status.set('success');
    fixture.detectChanges();

    const viewport = fixture.debugElement.query(By.directive(BrowseGridViewportComponent))
      .componentInstance as BrowseGridViewportComponent;
    viewport.visibleRange.emit({start: 0, end: 2});

    expect(host.visibleRange).toEqual({start: 0, end: 2});
  });
});

describe('browse-grid.util', () => {
  it('skeletonFillCount covers the viewport plus overscan rows', () => {
    expect(skeletonFillCount(0, 4, 100, 16)).toBe(4 * 2);
    expect(skeletonFillCount(600, 4, 100, 16)).toBe(4 * (Math.ceil(600 / 116) + 2));
  });
});
