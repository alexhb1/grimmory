import { cn } from '../cn';
import {
  overlayListItemRowClass,
  overlayListSectionLabelClass,
  overlayListSeparatorClass,
  overlayListShortcutClass,
  overlayListSurfaceClass,
} from '../overlay-list.styles';

export type AppMenuItemVariant = 'default' | 'destructive';

export const appMenuPanelClass = cn(
  'm-0 box-border flex max-h-[calc(100vh-1rem)] min-w-[8rem] flex-col p-1',
  overlayListSurfaceClass,
);

export const appMenuSheetPanelClass =
  'w-full max-w-full max-h-[80dvh] overflow-y-auto overscroll-contain ' +
  'rounded-t-xl rounded-b-none border-x-0 border-b-0 ' +
  'pt-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]';

export const appMenuSheetPaneClass = 'will-change-transform animate-in-sheet slide-in-from-bottom-full';

export const appMenuAccordionPanelClass =
  'm-0 box-border flex min-w-0 flex-col my-1 ml-4 border-l border-border pl-1.5';

const menuItemStateClass =
  'data-[active=true]:bg-surface-hover data-[active=true]:text-text-strong ' +
  'hover:bg-surface-hover hover:text-text-strong ' +
  'aria-disabled:pointer-events-none aria-disabled:opacity-50';

const menuItemDestructiveStateClass =
  'text-danger ' +
  'data-[active=true]:bg-danger/10 data-[active=true]:text-danger dark:data-[active=true]:bg-danger/20 ' +
  'hover:bg-danger/10 hover:text-danger dark:hover:bg-danger/20 ' +
  'aria-disabled:pointer-events-none aria-disabled:opacity-50';

export function appMenuItemRowClass(variant: AppMenuItemVariant): string {
  return cn(
    overlayListItemRowClass,
    'cursor-pointer rounded-sm text-text no-underline',
    variant === 'destructive' ? menuItemDestructiveStateClass : menuItemStateClass,
  );
}

export const appMenuLeadingSlotClass = 'flex size-4 shrink-0 items-center justify-center text-text-muted';
export const appMenuIconClass = 'size-4 shrink-0';
export const appMenuSpinnerClass = 'size-4 shrink-0 border-2';
export const appMenuLabelClass = 'min-w-0 flex-1 truncate leading-5';
export const appMenuShortcutClass = overlayListShortcutClass;
export const appMenuSubmenuIconClass = 'ml-auto size-4 shrink-0 text-text-muted';
export const appMenuCheckIconClass = 'size-4 shrink-0 text-primary';
export const appMenuSectionClass = cn(overlayListSectionLabelClass, 'text-text-muted');
export const appMenuSeparatorClass = overlayListSeparatorClass;
