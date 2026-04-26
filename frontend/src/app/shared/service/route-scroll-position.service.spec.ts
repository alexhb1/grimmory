import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {beforeEach, describe, expect, it} from 'vitest';

import {RouteScrollPositionService} from './route-scroll-position.service';

describe('RouteScrollPositionService', () => {
  let service: RouteScrollPositionService;

  beforeEach(() => {
    TestBed.configureTestingModule({providers: [provideRouter([])]});
    service = TestBed.inject(RouteScrollPositionService);
  });

  it('stores, retrieves, and creates stable keys', () => {
    expect(service.getPosition('books')).toBeUndefined();

    service.savePosition('books', 144);
    service.savePosition('books:library', 288);

    expect(service.getPosition('books')).toBe(144);
    expect(service.getPosition('books:library')).toBe(288);
    expect(service.createKey('/books', {libraryId: '1', shelfId: '2'})).toBe('/books:1-2');
    expect(service.createKey('/books', {shelfId: '2', libraryId: '1'})).toBe('/books:1-2');
    expect(service.createKey('/books', {})).toBe('/books');
  });
});
