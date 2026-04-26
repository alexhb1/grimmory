import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {LocalStorageService} from '../../../shared/service/local-storage.service';
import {SeriesScalePreferenceService} from './series-scale-preference.service';

describe('SeriesScalePreferenceService', () => {
  const localStorageService = {
    get: vi.fn(),
    set: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorageService.get.mockReset();
    localStorageService.set.mockReset();
    localStorageService.get.mockReturnValue(0.75);

    TestBed.configureTestingModule({
      providers: [
        SeriesScalePreferenceService,
        {provide: LocalStorageService, useValue: localStorageService},
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads the persisted scale and does not persist unchanged values', () => {
    const service = TestBed.inject(SeriesScalePreferenceService);

    expect(service.scaleFactor()).toBe(0.75);

    service.setScale(0.75);

    expect(localStorageService.set).not.toHaveBeenCalled();
  });

  it('persists updated scale immediately', () => {
    const service = TestBed.inject(SeriesScalePreferenceService);

    service.setScale(0.9);

    expect(localStorageService.set).toHaveBeenCalledOnce();
    expect(localStorageService.set).toHaveBeenCalledWith('seriesScalePreference', 0.9);
  });

  it('falls back to the default scale when storage contains an invalid value', () => {
    localStorageService.get.mockReturnValue(undefined);

    const service = TestBed.inject(SeriesScalePreferenceService);

    expect(service.scaleFactor()).toBe(1);
  });
});
