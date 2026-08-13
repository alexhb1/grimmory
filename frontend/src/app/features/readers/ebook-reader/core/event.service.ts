import {inject, Injectable} from '@angular/core';
import {Subject} from 'rxjs';
import {ReaderAnnotationService} from '../features/annotations/annotation-renderer.service';
import {
  FoliateDrawAnnotationEventDetail,
  FoliateEventTarget,
  FoliateLoadEventDetail,
  FoliateRelocateEventDetail,
} from './foliate-view.contract';

export interface TextSelection {
  text: string;
  cfi: string;
  range: Range;
  index: number;
  linkUrl?: string;
}

interface PopupPosition {
  x: number;
  y: number;
  showBelow?: boolean;
}

interface IframeClickMessage {
  type: 'iframe-click';
  clientX: number;
  clientY: number;
  iframeLeft: number;
  iframeWidth: number;
  eventClientX: number;
  target?: string;
}

export type ViewEvent =
  | { type: 'load'; detail?: FoliateLoadEventDetail }
  | { type: 'relocate'; detail: FoliateRelocateEventDetail }
  | { type: 'error'; detail?: unknown }
  | { type: 'middle-single-tap' }
  | { type: 'draw-annotation'; detail: FoliateDrawAnnotationEventDetail }
  | { type: 'show-annotation'; detail?: unknown }
  | { type: 'text-selected'; detail: TextSelection; popupPosition: PopupPosition }
  | { type: 'toggle-fullscreen' }
  | { type: 'toggle-shortcuts-help' }
  | { type: 'escape-pressed' }
  | { type: 'go-first-section' }
  | { type: 'go-last-section' }
  | { type: 'toggle-toc' }
  | { type: 'toggle-search' }
  | { type: 'toggle-notes' }
  | { type: 'toggle-immersive' };

interface ViewCallbacks {
  prev: () => void;
  next: () => void;
  getCFI: (index: number, range: Range) => string | null;
  getContents: () => { index: number; doc: Document }[] | null;
}

function isElementNode(value: EventTarget | null | undefined): value is Element {
  return typeof value === 'object' && value !== null && 'nodeType' in value && value.nodeType === Node.ELEMENT_NODE;
}

@Injectable({
  providedIn: 'root'
})
export class ReaderEventService {
  private readonly DOUBLE_CLICK_INTERVAL_MS = 300;
  private readonly LONG_HOLD_THRESHOLD_MS = 500;
  private readonly LEFT_ZONE_PERCENT = 0.3;
  private readonly RIGHT_ZONE_PERCENT = 0.7;
  private readonly SWIPE_THRESHOLD_PX = 50;

  private annotationService = inject(ReaderAnnotationService);

  private view: FoliateEventTarget | null = null;
  private viewCallbacks: ViewCallbacks | null = null;
  private isNavigating = false;
  private lastClickTime = 0;
  private lastClickZone: 'left' | 'middle' | 'right' | null = null;
  private longHoldTimeout: ReturnType<typeof setTimeout> | null = null;
  private keydownHandler?: (event: KeyboardEvent) => void;
  private clickedDocs = new WeakSet<Document>();
  private iframeCleanupFns: (() => void)[] = [];

  private touchStartX = 0;
  private touchStartY = 0;
  private isTextSelectionInProgress = false;
  private touchStartTime = 0;
  private selectionChangeTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastTouchTime = 0;

  private eventSubject = new Subject<ViewEvent>();
  public events$ = this.eventSubject.asObservable();

  initialize(view: FoliateEventTarget, callbacks: ViewCallbacks): void {
    this.view = view;
    this.viewCallbacks = callbacks;
    this.attachViewEventListeners();
    this.attachKeyboardHandler();
    this.attachWindowMessageHandler();
  }

  destroy(): void {
    window.removeEventListener('message', this.windowMessageHandler);
    for (const fn of this.iframeCleanupFns) fn();
    this.iframeCleanupFns = [];
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = undefined;
    }
    if (this.longHoldTimeout) {
      clearTimeout(this.longHoldTimeout);
      this.longHoldTimeout = null;
    }
    if (this.selectionChangeTimeout) {
      clearTimeout(this.selectionChangeTimeout);
      this.selectionChangeTimeout = null;
    }
    this.view = null;
    this.viewCallbacks = null;
    this.isNavigating = false;
    this.lastClickTime = 0;
    this.lastClickZone = null;
    this.clickedDocs = new WeakSet<Document>();
  }

  emit(event: ViewEvent): void {
    this.eventSubject.next(event);
  }

  private attachViewEventListeners(): void {
    if (!this.view) return;

    this.view.addEventListener('load', event => {
      this.eventSubject.next({type: 'load', detail: event.detail});
      const doc = event.detail?.doc;
      if (doc) {
        if (this.keydownHandler) {
          const handler = this.keydownHandler;
          doc.addEventListener('keydown', handler);
          this.iframeCleanupFns.push(() => doc.removeEventListener('keydown', handler));
        }
        this.attachIframeEventHandlers(doc);
      }

      const allAnnotations = this.annotationService.getAllAnnotations();
      if (allAnnotations.length > 0 && this.view) {
        setTimeout(() => {
          allAnnotations.forEach(annotation => {
            this.view?.addAnnotation({value: annotation.value})
              .catch((error: unknown) => console.error('Failed to restore ebook annotation', error));
          });
        }, 100);
      }
    });

    this.view.addEventListener('relocate', event => {
      this.eventSubject.next({type: 'relocate', detail: event.detail});
    });

    this.view.addEventListener('error', event => {
      this.eventSubject.next({type: 'error', detail: event.detail});
    });

    this.view.addEventListener('draw-annotation', event => {
      const {draw, annotation, doc, range} = event.detail;
      const storedStyle = this.annotationService.getAnnotationStyle(annotation.value);
      if (storedStyle) {
        const overlayerStyle = this.annotationService.getOverlayerDrawFunction(storedStyle.style);
        draw(overlayerStyle, {color: storedStyle.color});
      }
      this.eventSubject.next({type: 'draw-annotation', detail: {draw, annotation, doc, range}});
    });

    this.view.addEventListener('show-annotation', event => {
      this.eventSubject.next({type: 'show-annotation', detail: event.detail});
    });
  }

  private attachKeyboardHandler(): void {
    this.keydownHandler = (event: KeyboardEvent) => {
      const target = event.target;
      const contentEditable = isElementNode(target) ? target.closest('[contenteditable]') : null;
      if (isElementNode(target) && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || (contentEditable !== null
          && contentEditable.getAttribute('contenteditable')?.toLowerCase() !== 'false')
      )) {
        return;
      }
      const k = event.key;
      if (k === 'ArrowLeft' || k === 'PageUp') {
        this.viewCallbacks?.prev();
        event.preventDefault();
      } else if (k === 'ArrowRight' || k === 'PageDown') {
        this.viewCallbacks?.next();
        event.preventDefault();
      } else if (k === ' ' && event.shiftKey) {
        this.viewCallbacks?.prev();
        event.preventDefault();
      } else if (k === ' ') {
        this.viewCallbacks?.next();
        event.preventDefault();
      } else if (k === 'Home') {
        this.eventSubject.next({type: 'go-first-section'});
        event.preventDefault();
      } else if (k === 'End') {
        this.eventSubject.next({type: 'go-last-section'});
        event.preventDefault();
      } else if (k === 'f' || k === 'F') {
        this.eventSubject.next({type: 'toggle-fullscreen'});
        event.preventDefault();
      } else if (k === 't' || k === 'T') {
        this.eventSubject.next({type: 'toggle-toc'});
        event.preventDefault();
      } else if (k === 's' || k === 'S') {
        this.eventSubject.next({type: 'toggle-search'});
        event.preventDefault();
      } else if (k === 'n' || k === 'N') {
        this.eventSubject.next({type: 'toggle-notes'});
        event.preventDefault();
      } else if (k === 'i' || k === 'I') {
        this.eventSubject.next({type: 'toggle-immersive'});
        event.preventDefault();
      } else if (k === '?') {
        this.eventSubject.next({type: 'toggle-shortcuts-help'});
        event.preventDefault();
      } else if (k === 'Escape') {
        this.eventSubject.next({type: 'escape-pressed'});
        event.preventDefault();
      }
    };
    document.addEventListener('keydown', this.keydownHandler);
  }

  private readonly windowMessageHandler = (event: MessageEvent<unknown>): void => {
    if (this.isIframeClickMessage(event.data)) {
      this.handleIframeClickMessage(event.data);
    }
  };

  private attachWindowMessageHandler(): void {
    window.addEventListener('message', this.windowMessageHandler);
  }

  private isIframeClickMessage(value: unknown): value is IframeClickMessage {
    return typeof value === 'object'
      && value !== null
      && 'type' in value
      && value.type === 'iframe-click';
  }

  private attachIframeEventHandlers(doc: Document): void {
    if (this.clickedDocs.has(doc)) {
      return;
    }
    this.clickedDocs.add(doc);

    const track = <K extends keyof DocumentEventMap>(
      type: K,
      handler: (this: Document, event: DocumentEventMap[K]) => void,
      options?: AddEventListenerOptions | boolean,
    ): void => {
      doc.addEventListener(type, handler, options);
      this.iframeCleanupFns.push(() => doc.removeEventListener(type, handler, options));
    };

    track('mousedown', () => {
      this.longHoldTimeout = setTimeout(() => {
        this.longHoldTimeout = null;
      }, this.LONG_HOLD_THRESHOLD_MS);
    }, {capture: true});

    track('mouseup', () => {
      this.handleSelectionEnd(doc);
    });

    track('click', event => {
      // Ignore synthesized mouse events that follow touch events
      if (Date.now() - this.lastTouchTime < 500) {
        return;
      }

      const iframe = doc.defaultView?.frameElement;
      if (!iframe) return;

      const iframeRect = iframe.getBoundingClientRect();
      const viewportX = iframeRect.left + event.clientX;
      const viewportY = iframeRect.top + event.clientY;

      window.postMessage({
        type: 'iframe-click',
        clientX: viewportX,
        clientY: viewportY,
        iframeLeft: iframeRect.left,
        iframeWidth: iframeRect.width,
        eventClientX: event.clientX,
        target: isElementNode(event.target) ? event.target.tagName : undefined
      }, '*');
    }, {capture: true});

    track('touchstart', event => {
      this.handleTouchStart(event, doc);
    }, {passive: true});

    track('touchmove', event => {
      this.handleTouchMove(event, doc);
    }, {passive: false});

    track('touchend', event => {
      this.handleTouchEnd(event, doc);
    }, {passive: false});

    track('selectionchange', () => {
      this.handleSelectionChange(doc);
    });

    this.injectMobileSelectionStyles(doc);
  }

  private handleSelectionChange(doc: Document): void {
    if (this.selectionChangeTimeout) {
      clearTimeout(this.selectionChangeTimeout);
    }

    this.selectionChangeTimeout = setTimeout(() => {
      const selection = doc.defaultView?.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return;
      }

      const range = selection.getRangeAt(0);
      const text = range.toString().trim();
      if (!text) return;

      if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        this.handleSelectionEnd(doc);
      }
    }, 300);
  }

  private injectMobileSelectionStyles(doc: Document): void {
    const styleId = 'grimmory-mobile-selection-styles';
    if (doc.getElementById(styleId)) return;

    const style = doc.createElement('style');
    style.id = styleId;
    style.textContent = `
      * {
        -webkit-touch-callout: none !important;
        -webkit-user-select: text !important;
        user-select: text !important;
      }
    `;
    doc.head.appendChild(style);
  }

  private handleTouchStart(event: TouchEvent, _doc: Document): void {
    void _doc;
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = Date.now();
    this.isTextSelectionInProgress = false;

    this.longHoldTimeout = setTimeout(() => {
      this.longHoldTimeout = null;
    }, this.LONG_HOLD_THRESHOLD_MS);
  }

  private handleTouchMove(event: TouchEvent, doc: Document): void {
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - this.touchStartX);
    const deltaY = Math.abs(touch.clientY - this.touchStartY);

    const selection = doc.defaultView?.getSelection();
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      this.isTextSelectionInProgress = true;
      event.preventDefault();
      return;
    }

    if (deltaX > 10 && deltaX > deltaY && !this.isTextSelectionInProgress) {
      return;
    }
  }

  private handleTouchEnd(event: TouchEvent, doc: Document): void {
    const touchEndTime = Date.now();
    const touchDuration = touchEndTime - this.touchStartTime;
    this.lastTouchTime = touchEndTime;

    const selection = doc.defaultView?.getSelection();
    const hasSelection = selection && !selection.isCollapsed && selection.rangeCount > 0;

    if (hasSelection) {
      this.isTextSelectionInProgress = false;
      event.preventDefault();

      setTimeout(() => {
        this.handleSelectionEnd(doc);
      }, 50);
      return;
    }

    if (!this.isTextSelectionInProgress && event.changedTouches.length === 1) {
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - this.touchStartX;
      const deltaY = Math.abs(touch.clientY - this.touchStartY);

      if (Math.abs(deltaX) >= this.SWIPE_THRESHOLD_PX && Math.abs(deltaX) > deltaY) {
        if (this.isNavigating) return;

        this.isNavigating = true;
        if (deltaX < 0) {
          this.viewCallbacks?.next();
        } else {
          this.viewCallbacks?.prev();
        }
        setTimeout(() => this.isNavigating = false, 300);
        return;
      }

      if (touchDuration < this.LONG_HOLD_THRESHOLD_MS && Math.abs(deltaX) < 10 && deltaY < 10) {
        const iframe = doc.defaultView?.frameElement;
        if (!iframe) return;

        const iframeRect = iframe.getBoundingClientRect();
        const viewportX = iframeRect.left + touch.clientX;

        window.postMessage({
          type: 'iframe-click',
          clientX: viewportX,
          clientY: iframeRect.top + touch.clientY,
          iframeLeft: iframeRect.left,
          iframeWidth: iframeRect.width,
          eventClientX: touch.clientX,
          target: isElementNode(event.target) ? event.target.tagName : undefined
        }, '*');
      }
    }

    this.isTextSelectionInProgress = false;
  }

  private handleSelectionEnd(doc: Document): void {
    setTimeout(() => {
      const selection = doc.defaultView?.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return;
      }

      const range = selection.getRangeAt(0);
      const text = range.toString().trim();
      if (!text) return;

      const contents = this.viewCallbacks?.getContents();
      if (!contents || contents.length === 0) return;

      const {index} = contents[0];
      const cfi = this.viewCallbacks?.getCFI(index, range);

      if (cfi) {
        const iframe = doc.defaultView?.frameElement;
        const rangeRect = range.getBoundingClientRect();
        let popupX = rangeRect.left + (rangeRect.width / 2);
        let selectionTop = rangeRect.top;
        let selectionBottom = rangeRect.bottom;

        if (iframe) {
          const iframeRect = iframe.getBoundingClientRect();
          popupX = iframeRect.left + rangeRect.left + (rangeRect.width / 2);
          selectionTop = iframeRect.top + rangeRect.top;
          selectionBottom = iframeRect.top + rangeRect.bottom;
        }

        const minSpaceAbove = 120;
        const showBelow = selectionTop < minSpaceAbove;

        let popupY: number;
        if (showBelow) {
          popupY = selectionBottom + 10;
        } else {
          popupY = selectionTop - 50;
        }

        popupX = Math.max(100, Math.min(popupX, window.innerWidth - 150));

        const linkUrl = this.getLinkUrl(range, selection);

        this.eventSubject.next({
          type: 'text-selected',
          detail: {text, cfi, range, index, linkUrl},
          popupPosition: {x: popupX, y: popupY, showBelow}
        });
      }
    }, 10);
  }

  private getLinkUrl(range: Range, selection: Selection): string | undefined {
    const getLinkFromNode = (node: Node | null | undefined): string | undefined => {
      let current: Node | null | undefined = node;
      while (current && current.nodeType !== Node.DOCUMENT_NODE) {
        if (isElementNode(current)) {
          if (current.tagName.toLowerCase() === 'a') {
            return current.getAttribute('href') || undefined;
          }
          const href = current.closest('a')?.getAttribute('href');
          if (href) return href;
        }
        current = current.parentNode;
      }
      return undefined;
    };

    // Check ancestors and self for common ancestor, start, end, anchor and focus nodes
    let linkUrl = getLinkFromNode(range.commonAncestorContainer) ||
                 getLinkFromNode(range.startContainer) ||
                 getLinkFromNode(range.endContainer) ||
                 getLinkFromNode(selection.anchorNode) ||
                 getLinkFromNode(selection.focusNode);

    // If still not found, check if the range contains any links
    if (!linkUrl && isElementNode(range.commonAncestorContainer)) {
      const links = Array.from(range.commonAncestorContainer.querySelectorAll('a'));
      const internalLink = links.find(link => range.intersectsNode(link));
      linkUrl = internalLink?.getAttribute('href') || undefined;
    }

    return linkUrl;
  }

  private handleIframeClickMessage(data: IframeClickMessage): void {
    if (!this.view) return;

    const now = Date.now();
    const timeSinceLastClick = now - this.lastClickTime;

    const viewRect = this.view.getBoundingClientRect();
    const x = data.clientX - viewRect.left;
    const width = viewRect.width;

    const leftThreshold = width * this.LEFT_ZONE_PERCENT;
    const rightThreshold = width * this.RIGHT_ZONE_PERCENT;

    let currentZone: 'left' | 'middle' | 'right';
    if (x < leftThreshold) {
      currentZone = 'left';
    } else if (x > rightThreshold) {
      currentZone = 'right';
    } else {
      currentZone = 'middle';
    }

    if (timeSinceLastClick < this.DOUBLE_CLICK_INTERVAL_MS && this.lastClickZone === currentZone) {
      this.lastClickTime = now;
      this.lastClickZone = currentZone;
      return;
    }

    this.lastClickTime = now;
    this.lastClickZone = currentZone;

    setTimeout(() => {
      if (Date.now() - this.lastClickTime >= this.DOUBLE_CLICK_INTERVAL_MS) {
        this.processIframeClick(data);
      }
    }, this.DOUBLE_CLICK_INTERVAL_MS);
  }

  private processIframeClick(data: IframeClickMessage): void {
    if (!this.longHoldTimeout) {
      return;
    }

    if (this.isNavigating) {
      return;
    }

    if (!this.view) return;

    const viewRect = this.view.getBoundingClientRect();
    const x = data.clientX - viewRect.left;
    const width = viewRect.width;

    const leftThreshold = width * this.LEFT_ZONE_PERCENT;
    const rightThreshold = width * this.RIGHT_ZONE_PERCENT;

    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (x < leftThreshold && !isMobile) {
      this.isNavigating = true;
      this.viewCallbacks?.prev();
      setTimeout(() => this.isNavigating = false, 300);
    } else if (x > rightThreshold && !isMobile) {
      this.isNavigating = true;
      this.viewCallbacks?.next();
      setTimeout(() => this.isNavigating = false, 300);
    } else {
      this.eventSubject.next({type: 'middle-single-tap'});
    }
  }
}
