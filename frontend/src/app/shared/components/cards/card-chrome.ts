
export const CARD_COVER_SHADOW = 'shadow-card';
export const CARD_COVER_SHADOW_HOVER = 'group-hover/card:shadow-card-hover';

export const CARD_CHECKBOX_BASE =
  'group/check absolute z-20 flex size-6 items-center justify-center rounded-md bg-black/80 text-white ring-1 ring-inset ring-white/30 transition-opacity motion-reduce:transition-none ' +
  'opacity-0 group-hover/card:opacity-100 group-has-[:focus-visible]/card:opacity-100 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
export const CARD_CHECKBOX_SELECTED = 'bg-primary text-primary-contrast ring-primary';
export const CARD_CHECK_ICON =
  'size-3.5 opacity-0 transition-opacity group-hover/check:opacity-100 motion-reduce:transition-none';

export const CARD_OVERLAY_BASE =
  'absolute inset-x-0 bottom-0 z-20 flex translate-y-1 gap-1.5 p-2 opacity-0 transition-[opacity,translate] duration-150 group-hover/card:translate-y-0 group-hover/card:opacity-100 group-has-[:focus-visible]/card:translate-y-0 group-has-[:focus-visible]/card:opacity-100 motion-reduce:transition-none';
export const CARD_OVERLAY_PINNED = 'translate-y-0 opacity-100';

export const CARD_TRANSLUCENT_ACTION =
  'inline-flex items-center justify-center gap-1.5 rounded-md bg-black/80 text-xs font-[550] text-white ring-1 ring-inset ring-white/20 hover:bg-black/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export const CARD_META_TITLE = 'min-h-[17px] truncate text-[13px]/[17px] font-[550] text-text';
export const CARD_META_MUTED = 'min-h-[15px] truncate text-xs/[15px] text-text-muted';

function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
}

export function isMacContextClick(event: MouseEvent): boolean {
  return isMacPlatform() && event.ctrlKey;
}

export function isSelectionToggleClick(event: MouseEvent): boolean {
  return isMacPlatform() ? event.metaKey : event.ctrlKey;
}
