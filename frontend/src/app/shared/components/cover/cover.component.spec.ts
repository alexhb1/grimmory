import {ComponentFixture, TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {CoverComponent} from './cover.component';

describe('CoverComponent', () => {
  let fixture: ComponentFixture<CoverComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CoverComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CoverComponent);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('falls back to the placeholder when the image fails to load', () => {
    fixture.componentRef.setInput('src', '/api/v1/media/book/1/thumbnail');
    fixture.componentRef.setInput('title', 'Dune');
    fixture.detectChanges();

    fixture.nativeElement.querySelector('img.cover-img').dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.placeholder')).not.toBeNull();
  });

  it('uses an empty alt by default', () => {
    fixture.componentRef.setInput('src', '/api/v1/media/book/1/thumbnail');
    fixture.componentRef.setInput('title', 'Dune');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img.cover-img').getAttribute('alt')).toBe('');
  });

  it('uses the explicit alt text when provided', () => {
    fixture.componentRef.setInput('src', '/api/v1/media/book/1/thumbnail');
    fixture.componentRef.setInput('alt', 'Dune');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img.cover-img').getAttribute('alt')).toBe('Dune');
  });

  it('renders the preview image when preview is enabled', () => {
    fixture.componentRef.setInput('src', '/api/v1/media/book/1/thumbnail');
    fixture.componentRef.setInput('alt', 'Dune');
    fixture.componentRef.setInput('preview', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('p-image')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('img.cover-img').getAttribute('alt')).toBe('Dune');
  });
});
