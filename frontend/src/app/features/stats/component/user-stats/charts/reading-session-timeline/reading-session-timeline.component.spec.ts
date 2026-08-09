import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getTranslocoModule } from '../../../../../../core/testing/transloco-testing';
import { ReadingSessionTimelineComponent } from './reading-session-timeline.component';

describe('ReadingSessionTimelineComponent', () => {
  let fixture: ComponentFixture<ReadingSessionTimelineComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReadingSessionTimelineComponent, getTranslocoModule()],
    }).compileComponents();

    fixture = TestBed.createComponent(ReadingSessionTimelineComponent);
    fixture.componentRef.setInput('year', 2026);
    fixture.componentRef.setInput('week', 1);
    fixture.componentRef.setInput('stats', {
      sessionCount: 1,
      segments: [{
        key: 'session-1',
        bookId: 12,
        bookTitle: 'Night Reading',
        bookType: 'EPUB',
        dayIndex: 0,
        lane: 0,
        laneCount: 1,
        startHour: 20,
        endHour: 21.5,
        durationMinutes: 90,
      }],
    });
    await fixture.whenStable();
  });

  it('offers direct year and week controls independently of reading data', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('input[aria-label="Select Year"]')).not.toBeNull();
    expect(element.querySelector('input[aria-label="Select Week"]')).not.toBeNull();
  });

  it('preserves the cover, book, time, duration and format tooltip content', () => {
    const element = fixture.nativeElement as HTMLElement;
    const label = element.querySelector<HTMLElement>('[role="img"]')?.getAttribute('aria-label');

    expect(label).toContain('Night Reading');
    expect(label).toContain('Time:');
    expect(label).toContain('Duration: 1h 30m 0s');
    expect(label).toContain('Format: EPUB');
    expect(element.querySelector<HTMLImageElement>('[role="tooltip"] img')?.src)
      .toContain('/book/12/thumbnail');
  });

  it('carries the ISO year across week navigation', async () => {
    const emitted = vi.fn();
    fixture.componentInstance.weekChange.subscribe(emitted);

    const previous = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[title="Previous week"]');
    previous?.click();
    await fixture.whenStable();

    expect(emitted).toHaveBeenCalledWith({ year: 2025, week: 52 });
  });
});
