import { computed, Directive, ElementRef, inject, input } from '@angular/core';

export type InputSize = 'sm' | 'md';

@Directive({
  selector: 'input[appInput], textarea[appInput]',
  standalone: true,
  host: {
    '[class]': 'classes()',
  },
})
export class InputDirective {
  size = input<InputSize>('md');

  private el = inject(ElementRef);
  private isTextarea = this.el.nativeElement.tagName === 'TEXTAREA';

  private base =
    'w-full bg-surface-raised text-sm text-ink border-none rounded-[6px] shadow-paper outline-none transition-colors placeholder:text-ink-muted focus:ring-1 focus:ring-accent/50 disabled:opacity-50 disabled:cursor-not-allowed';

  private inputSizeClasses: Record<InputSize, string> = {
    sm: 'h-8 px-2.5 text-xs',
    md: 'h-9 px-3',
  };

  private textareaSizeClasses: Record<InputSize, string> = {
    sm: 'px-2.5 py-2 text-xs',
    md: 'px-3 py-2.5',
  };

  classes = computed(() => {
    const sizeMap = this.isTextarea ? this.textareaSizeClasses : this.inputSizeClasses;
    return `${this.base} ${sizeMap[this.size()]}`;
  });
}
