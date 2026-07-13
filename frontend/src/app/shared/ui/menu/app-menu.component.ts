import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  type FlexibleConnectedPositionStrategy,
  type FlexibleConnectedPositionStrategyOrigin,
  Overlay,
  type OverlayRef,
} from '@angular/cdk/overlay';
import { DomPortal } from '@angular/cdk/portal';
import { Menu, MenuItem } from '@angular/aria/menu';
import { type Subscription } from 'rxjs';

import { cn } from '../cn';
import {
  connectedOverlayPanelClass,
  connectedOverlayPositions,
  connectedOverlayScrollStrategy,
} from '../connected-overlay';
import { injectMobileShell } from '../mobile-shell';
import { scrollLockStrategy } from '../scroll-lock';
import {
  appMenuAccordionPanelClass,
  appMenuPanelClass,
  appMenuSheetPanelClass,
  appMenuSheetPaneClass,
} from './menu.styles';
import { submenuOverlayPositions } from './menu-position';
import { AppMenuAriaItemDirective } from './menu-aria-item.directive';

const menuByElement = new WeakMap<Element, AppMenuComponent>();

@Component({
  selector: 'app-menu',
  standalone: true,
  hostDirectives: [{ directive: Menu, inputs: ['wrap', 'typeaheadDelay', 'disabled', 'expansionDelay'] }],
  host: {
    '[class]': 'panelClass()',
    '[class.hidden]': '!rendered()',
    '[attr.aria-label]': 'ariaLabel()',
    '(keydown.escape)': 'onEscape($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
})
export class AppMenuComponent {
  readonly ariaLabel = input.required<string>();
  readonly menuClass = input('');

  readonly opened = output<void>();
  readonly closed = output<void>();

  readonly menu = inject(Menu) as Menu<unknown>;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly overlay = inject(Overlay);
  private readonly destroyRef = inject(DestroyRef);
  private readonly items = contentChildren(AppMenuAriaItemDirective, { descendants: true });

  private readonly isOpen = signal(false);
  private readonly opener = signal<HTMLElement | null>(null);
  private anchor: FlexibleConnectedPositionStrategyOrigin | null = null;
  private contextZone: HTMLElement | null = null;
  private pendingContextGestureRelease = false;
  private overlayRef: OverlayRef | null = null;
  private overlayIsSheet = false;
  private portal: DomPortal | null = null;
  private outsideSub: Subscription | null = null;
  private positionSub: Subscription | null = null;

  readonly opensUpward = signal(false);

  private readonly isSubmenu = computed(() => this.menu.parent() instanceof MenuItem);
  protected readonly rendered = computed(() => (this.isSubmenu() ? this.menu.visible() : this.isOpen()));

  private readonly isMobileShell = injectMobileShell();
  private readonly sheetPresentation = computed(() => !this.isSubmenu() && this.isMobileShell());
  private readonly accordionPresentation = computed(() => this.isSubmenu() && this.isMobileShell());

  protected readonly panelClass = computed(() =>
    this.accordionPresentation()
      ? appMenuAccordionPanelClass
      : cn(appMenuPanelClass, this.menuClass(), this.sheetPresentation() && appMenuSheetPanelClass),
  );

  constructor() {
    menuByElement.set(this.host.nativeElement, this);

    const guard = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target === this.host.nativeElement) {
        event.stopPropagation();
      }
    };
    this.host.nativeElement.addEventListener('keydown', guard, true);
    this.destroyRef.onDestroy(() => this.host.nativeElement.removeEventListener('keydown', guard, true));

    const hoverGuard = (event: Event) => {
      if (this.isMobileShell()) event.stopPropagation();
    };
    this.host.nativeElement.addEventListener('mouseover', hoverGuard, true);
    this.host.nativeElement.addEventListener('mouseout', hoverGuard, true);
    this.destroyRef.onDestroy(() => {
      this.host.nativeElement.removeEventListener('mouseover', hoverGuard, true);
      this.host.nativeElement.removeEventListener('mouseout', hoverGuard, true);
    });

    let wasOpen = false;
    effect(() => {
      const open = this.rendered();
      if (open === wasOpen) return;
      wasOpen = open;
      if (open) {
        this.attachOverlay();
      } else {
        this.detachOverlay();
      }
    });

    effect(() => {
      const wantsSheet = this.sheetPresentation();
      if (this.isOpen() && this.overlayRef?.hasAttached() && wantsSheet !== this.overlayIsSheet) {
        untracked(() => this.close());
      }
    });

    afterRenderEffect({
      mixedReadWrite: () => {
        this.items();
        if (this.rendered() && this.overlayRef?.hasAttached()) {
          this.overlayRef.updatePosition();
        }
      },
    });

    this.destroyRef.onDestroy(() => {
      this.outsideSub?.unsubscribe();
      this.positionSub?.unsubscribe();
      this.overlayRef?.dispose();
    });
  }

  open(origin: HTMLElement): void {
    this.opener.set(origin);
    this.anchor = origin;
    this.contextZone = null;
    this.isOpen.set(true);
    this.moveToAnchor();
  }

  openAt(x: number, y: number, contextZone?: HTMLElement): void {
    this.opener.set(null);
    this.anchor = { x, y };
    this.contextZone = contextZone ?? null;
    this.pendingContextGestureRelease = true;
    this.isOpen.set(true);
    this.moveToAnchor();
  }

  private moveToAnchor(): void {
    const ref = this.overlayRef;
    if (!ref?.hasAttached() || !this.anchor || this.isSubmenu()) return;
    this.collapseChildren();
    if (this.overlayIsSheet) return;
    (ref.getConfig().positionStrategy as FlexibleConnectedPositionStrategy).setOrigin(this.anchor);
    ref.updatePosition();
  }

  close(): void {
    if (this.isSubmenu()) {
      this.menu.parent()?.close?.();
      return;
    }
    this.collapseChildren();
    this.isOpen.set(false);
  }

  isOpenState(): boolean {
    return this.rendered();
  }

  openerElement(): HTMLElement | null {
    return this.opener();
  }

  protected onEscape(event: Event): void {
    if (!this.isSubmenu() && this.isOpen()) {
      event.stopPropagation();
      this.close();
    }
  }

  closeChain(): void {
    const parent = this.parentPanel();
    if (parent) {
      parent.closeChain();
    } else {
      this.close();
    }
  }

  private parentPanel(): AppMenuComponent | undefined {
    const parentItem: unknown = this.menu.parent();
    return parentItem instanceof AppMenuAriaItemDirective ? parentItem.appOwner : undefined;
  }

  private ownItems(): readonly AppMenuAriaItemDirective[] {
    return this.items().filter((item) => item.parent === this.menu);
  }

  private collapseChildren(): void {
    for (const item of this.ownItems()) {
      if (item.expanded()) item.close();
    }
  }

  private attachOverlay(): void {
    const origin = this.isSubmenu() ? (this.menu.parent() as MenuItem<unknown>).element : this.anchor;
    if (!origin) return;

    if (this.accordionPresentation()) {
      (origin as HTMLElement).insertAdjacentElement('afterend', this.host.nativeElement);
      this.opened.emit();
      return;
    }

    const sheet = this.sheetPresentation();
    if (this.overlayRef && this.overlayIsSheet !== sheet) {
      this.positionSub?.unsubscribe();
      this.positionSub = null;
      this.overlayRef.dispose();
      this.overlayRef = null;
    }
    this.overlayIsSheet = sheet;

    if (sheet) {
      this.overlayRef ??= this.overlay.create({
        scrollStrategy: scrollLockStrategy(),
        hasBackdrop: true,
        backdropClass: 'app-menu-sheet-backdrop',
        width: '100%',
        panelClass: appMenuSheetPaneClass.split(' '),
        positionStrategy: this.overlay.position().global().bottom('0'),
      });
      this.opensUpward.set(true);
    } else {
      this.overlayRef ??= this.overlay.create({
        scrollStrategy: connectedOverlayScrollStrategy(this.overlay),
        panelClass: connectedOverlayPanelClass.split(' '),
        usePopover: this.isSubmenu(),
        positionStrategy: this.overlay
          .position()
          .flexibleConnectedTo(origin)
          .withFlexibleDimensions(false)
          .withPopoverLocation(this.isSubmenu() ? 'inline' : 'global')
          .withPositions(this.isSubmenu() ? submenuOverlayPositions : connectedOverlayPositions),
      });
      const strategy = this.overlayRef.getConfig().positionStrategy as FlexibleConnectedPositionStrategy;
      strategy.setOrigin(origin);
      this.positionSub ??= strategy.positionChanges.subscribe(change => {
        this.opensUpward.set(change.connectionPair.overlayY === 'bottom');
      });
    }

    this.portal ??= new DomPortal(this.host);
    if (!this.overlayRef.hasAttached()) this.overlayRef.attach(this.portal);
    this.overlayRef.updatePosition();

    if (!this.isSubmenu()) {
      this.outsideSub = sheet
        ? this.overlayRef.backdropClick().subscribe((event) => this.onOutsidePointer(event))
        : this.overlayRef.outsidePointerEvents().subscribe((event) => this.onOutsidePointer(event));
      queueMicrotask(() => this.focusActiveItem());
    }
    this.opened.emit();
  }

  private detachOverlay(): void {
    this.outsideSub?.unsubscribe();
    this.outsideSub = null;

    const hadFocus = this.host.nativeElement.contains(document.activeElement);
    this.overlayRef?.detach();

    if (!this.isSubmenu()) {
      const opener = this.opener();
      this.opener.set(null);
      this.contextZone = null;
      this.pendingContextGestureRelease = false;
      if (hadFocus && opener) {
        (opener.querySelector<HTMLElement>('button') ?? opener).focus();
      }
    }
    this.closed.emit();
  }

  private onOutsidePointer(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (this.opener()?.contains(target)) return;
    const isContextGestureEvent =
      event.type === 'auxclick' ||
      event.type === 'contextmenu' ||
      (event.type === 'click' && event.ctrlKey);
    if (isContextGestureEvent && this.pendingContextGestureRelease) {
      this.pendingContextGestureRelease = false;
      return;
    }
    if (isContextGestureEvent && this.contextZone?.contains(target)) {
      return;
    }
    const menuEl = target.closest('app-menu');
    if (menuEl) {
      const inChain = menuByElement.get(menuEl);
      if (inChain && this.containsMenu(inChain)) return;
    }
    this.close();
  }

  private containsMenu(other: AppMenuComponent): boolean {
    let current: AppMenuComponent | undefined = other;
    while (current) {
      if (current === this) return true;
      current = current.parentPanel();
    }
    return false;
  }

  private focusActiveItem(): void {
    this.host.nativeElement.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true });
  }
}
