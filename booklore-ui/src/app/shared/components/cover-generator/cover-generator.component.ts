import { Component, computed, input } from '@angular/core';

const COVER_COLORS = [
  '#1a1a2e', '#2d3436', '#0c3547', '#1e3d59', '#2c2c54', '#1b262c',
  '#2B2D42', '#3D405B', '#463F3A', '#1B2838', '#2E4057', '#4A3728',
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function coverColorFor(title: string, author: string): string {
  return COVER_COLORS[hashString(title + author) % COVER_COLORS.length];
}

export type CoverPlaceholderSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-cover-placeholder',
  standalone: true,
  template: `
    <div
      class="w-full h-full flex flex-col items-center justify-center text-center"
      [class]="containerClass()"
      [style.background]="color()"
    >
      <div [class]="titleClass()">{{ title() }}</div>
      <div [class]="authorClass()">{{ author() }}</div>
    </div>
  `,
  host: { class: 'block w-full h-full' },
})
export class CoverPlaceholderComponent {
  title = input('');
  author = input('');
  size = input<CoverPlaceholderSize>('md');

  color = computed(() => coverColorFor(this.title(), this.author()));

  containerClass = computed(() => {
    const base = 'w-full h-full flex flex-col items-center justify-center text-center';
    const padding: Record<CoverPlaceholderSize, string> = {
      sm: 'p-2',
      md: 'p-4',
      lg: 'p-6',
    };
    return `${base} ${padding[this.size()]}`;
  });

  titleClass = computed(() => {
    const base = 'text-white/90 font-semibold leading-snug mb-1 line-clamp-3';
    const sizes: Record<CoverPlaceholderSize, string> = {
      sm: 'text-[11px] mb-0.5',
      md: 'text-[13px]',
      lg: 'text-[15px] mb-2',
    };
    return `${base} ${sizes[this.size()]}`;
  });

  authorClass = computed(() => {
    const base = 'text-white/50 tracking-wide line-clamp-1';
    const sizes: Record<CoverPlaceholderSize, string> = {
      sm: 'text-[9px]',
      md: 'text-[11px]',
      lg: 'text-xs',
    };
    return `${base} ${sizes[this.size()]}`;
  });
}
