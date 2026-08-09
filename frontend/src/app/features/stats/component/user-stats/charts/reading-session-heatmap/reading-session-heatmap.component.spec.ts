import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getTranslocoModule } from '../../../../../../core/testing/transloco-testing';
import {
  EMPTY_SESSION_HEATMAP_CALENDAR,
  mapReadingStreaks,
} from '../../../../data/user/reading-session-heatmap-stats';
import { ReadingSessionHeatmapComponent } from './reading-session-heatmap.component';

describe('ReadingSessionHeatmapComponent', () => {
  let fixture: ComponentFixture<ReadingSessionHeatmapComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReadingSessionHeatmapComponent, getTranslocoModule()],
    }).compileComponents();

    fixture = TestBed.createComponent(ReadingSessionHeatmapComponent);
    fixture.componentRef.setInput('year', 2024);
    fixture.componentRef.setInput('stats', {
      calendar: EMPTY_SESSION_HEATMAP_CALENDAR,
      streaks: mapReadingStreaks(
        [{ date: '2026-01-01', count: 1 }],
        new Date('2026-01-02T12:00:00Z'),
      ),
    });
    await fixture.whenStable();
  });

  it('keeps the lifetime streak summary visible when the selected year is empty', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Current streak');
    expect(text).toContain('All-time reading days');
  });

  it('supports unrestricted year navigation', async () => {
    const emitted = vi.fn();
    fixture.componentInstance.yearChange.subscribe(emitted);

    const previous = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[title="Previous year"]');
    previous?.click();
    await fixture.whenStable();

    expect(emitted).toHaveBeenCalledWith(2023);
  });
});
