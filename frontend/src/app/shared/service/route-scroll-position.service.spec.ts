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

  it('stores and retrieves scroll positions by key', () => {
    expect(service.getPosition('books')).toBeUndefined();

    service.savePosition('books', 144);
    service.savePosition('books:library', 288);

    expect(service.getPosition('books')).toBe(144);
    expect(service.getPosition('books:library')).toBe(288);
  });

  it('creates stable route keys regardless of parameter order', () => {
    expect(service.createKey('/books', {libraryId: '1', shelfId: '2'})).toBe('/books:libraryId=1;shelfId=2');
    expect(service.createKey('/books', {shelfId: '2', libraryId: '1'})).toBe('/books:libraryId=1;shelfId=2');
  });

  it('encodes route key values and falls back to the path when params are empty', () => {
    expect(service.createKey('/books', {slug: 'one-two', type: 'magic&shelf'})).toBe('/books:slug=one-two;type=magic%26shelf');
    expect(service.createKey('/books', {})).toBe('/books');
  });
});
