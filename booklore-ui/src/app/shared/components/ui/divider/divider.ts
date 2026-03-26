import { Component, computed, input } from '@angular/core';

export type DividerLayout = 'horizontal' | 'vertical';

@Component({
  selector: 'app-divider',
  standalone: true,
  host: {
    '[class]': 'classes()',
    'role': 'separator',
    '[attr.aria-orientation]': 'layout()',
  },
  template: '',
})
export class DividerComponent {
  layout = input<DividerLayout>('horizontal');

  classes = computed(() =>
    this.layout() === 'vertical'
      ? 'inline-block self-stretch w-px bg-edge'
      : 'block w-full h-px bg-edge'
  );
}
