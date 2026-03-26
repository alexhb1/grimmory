import { Injectable } from '@angular/core';

/**
 * Global service to coordinate popup menus.
 * When any popup menu opens, it registers here.
 * Opening a new one closes the previous.
 */
@Injectable({ providedIn: 'root' })
export class PopupMenuService {
  private activeMenu: { hide: () => void } | null = null;

  /** Call before toggling a menu open. Closes any currently open menu. */
  register(menu: { hide: () => void }) {
    if (this.activeMenu && this.activeMenu !== menu) {
      this.activeMenu.hide();
    }
    this.activeMenu = menu;
  }

  /** Call when a menu closes. */
  unregister(menu: { hide: () => void }) {
    if (this.activeMenu === menu) {
      this.activeMenu = null;
    }
  }
}
