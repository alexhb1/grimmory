import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {LocalStorageService} from '../../../shared/service/local-storage.service';
import {AuthorScalePreferenceService} from './author-scale-preference.service';

describe('AuthorScalePreferenceService', () => {
  const localStorageService = {
    get: vi.fn(),
    set: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorageService.get.mockReset();
    localStorageService.set.mockReset();
    localStorageService.get.mockReturnValue(1.5);

    TestBed.configureTestingModule({
      providers: [
        AuthorScalePreferenceService,
        {provide: LocalStorageService, useValue: localStorageService},
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads the persisted scale and does not persist unchanged values', () => {
    const service = TestBed.inject(AuthorScalePreferenceService);

    expect(service.scaleFactor()).toBe(1.5);

    service.setScale(1.5);

    expect(localStorageService.set).not.toHaveBeenCalled();
  });

  it('persists updated scale immediately', () => {
    const service = TestBed.inject(AuthorScalePreferenceService);

    service.setScale(1.2);

    expect(localStorageService.set).toHaveBeenCalledOnce();
    expect(localStorageService.set).toHaveBeenCalledWith('authorScalePreference', 1.2);
  });

  it('falls back to the default scale when storage contains an invalid value', () => {
    localStorageService.get.mockReturnValue(Number.NaN);

    const service = TestBed.inject(AuthorScalePreferenceService);

    expect(service.scaleFactor()).toBe(1);
  });
});
