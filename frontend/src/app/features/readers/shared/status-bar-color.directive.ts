import { DOCUMENT } from '@angular/common';
import { afterEveryRender, DestroyRef, Directive, ElementRef, inject } from '@angular/core';

@Directive({
  selector: '[appStatusBarColor]',
  host: { style: 'isolation: isolate' },
})
export class StatusBarColorDirective {
  constructor() {
    const document = inject(DOCUMENT);
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let band: HTMLElement | null = null;
    let bandColor: string | null = null;

    afterEveryRender(() => {
      const background = getComputedStyle(element).backgroundColor;
      const color = background === 'rgba(0, 0, 0, 0)' || background === 'transparent' ? null : background;
      if (color === bandColor) {
        return;
      }
      document.body.style.backgroundColor = color ?? '';
      band?.remove();
      band = null;
      bandColor = color;
      if (color) {
        band = document.createElement('div');
        band.setAttribute('aria-hidden', 'true');
        band.style.cssText = 'position:fixed;top:0;left:0;right:0;height:8px;z-index:10000;pointer-events:none';
        band.style.backgroundColor = color;
        element.prepend(band);
      }
    });
    inject(DestroyRef).onDestroy(() => document.body.style.backgroundColor = '');
  }
}
