import { computed, Injectable, signal, Type } from '@angular/core';
import { Subject } from 'rxjs';
import { take } from 'rxjs/operators';
import { ModalSize } from './modal';

export interface ModalConfig<D = unknown> {
  title?: string;
  size?: ModalSize;
  height?: string;
  dismissible?: boolean;
  data?: D;
}

export class ModalRef<R = unknown> {
  private _onClose = new Subject<R | undefined>();
  onClose = this._onClose.pipe(take(1));

  /** Whether the modal body has been scrolled. */
  headerScrolled = signal(false);

  /** @internal Fired when close is requested — instance plays animation then finalizes. */
  readonly closeRequested = new Subject<void>();

  private _pendingResult: R | undefined;
  private _closed = false;

  constructor(private removeFn: (result?: R) => void) {}

  /** Request close with an optional result. Triggers animation, then removes from stack. */
  close(result?: R) {
    if (this._closed) return;
    this._pendingResult = result;
    this.closeRequested.next();
  }

  /** Call from (scroll) on the component's scrollable area. */
  reportScroll(event: Event) {
    this.headerScrolled.set((event.target as HTMLElement).scrollTop > 0);
  }

  /** @internal Called by the instance after the close animation finishes. */
  _finalizeClose() {
    if (this._closed) return;
    this._closed = true;
    this.removeFn(this._pendingResult);
    this._onClose.next(this._pendingResult);
    this._onClose.complete();
  }
}

export interface ActiveModal {
  component: Type<unknown>;
  config: ModalConfig;
  ref: ModalRef;
}

@Injectable({ providedIn: 'root' })
export class ModalService {
  private _stack = signal<ActiveModal[]>([]);

  /** All open modals, bottom to top. */
  stack = this._stack.asReadonly();

  /** Top-most modal, or null. */
  active = computed(() => {
    const s = this._stack();
    return s.length > 0 ? s[s.length - 1] : null;
  });

  open<D = unknown, R = unknown>(component: Type<unknown>, config: ModalConfig<D> = {}): ModalRef<R> {
    const ref = new ModalRef<R>((result?: R) => {
      this._stack.update(s => s.filter(m => m.ref !== ref));
    });

    this._stack.update(s => [...s, { component, config, ref: ref as ModalRef<any> }]);
    return ref;
  }
}
