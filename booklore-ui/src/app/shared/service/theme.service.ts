import { Injectable, signal } from '@angular/core';

export type ColorMode = 'dark' | 'light';
export type SurfaceStyle = 'default' | 'slate' | 'neutral';
export type HeadingFont = 'serif' | 'sans';

const STORAGE_KEY = 'grimmory-theme';

interface StoredTheme {
  mode: ColorMode;
  surface: SurfaceStyle;
  heading: HeadingFont;
}

function loadStored(): Partial<StoredTheme> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  mode: ReturnType<typeof signal<ColorMode>>;
  surface: ReturnType<typeof signal<SurfaceStyle>>;
  heading: ReturnType<typeof signal<HeadingFont>>;

  constructor() {
    const stored = loadStored();
    this.mode = signal<ColorMode>(stored.mode ?? 'dark');
    this.surface = signal<SurfaceStyle>(stored.surface ?? 'default');
    this.heading = signal<HeadingFont>(stored.heading ?? 'serif');
    this.apply();
  }

  setMode(mode: ColorMode) {
    this.mode.set(mode);
    this.apply();
  }

  setSurface(surface: SurfaceStyle) {
    this.surface.set(surface);
    this.apply();
  }

  setHeading(heading: HeadingFont) {
    this.heading.set(heading);
    this.apply();
  }

  private apply() {
    const el = document.documentElement;
    el.setAttribute('data-mode', this.mode());
    el.setAttribute('data-surface', this.surface());
    el.setAttribute('data-heading', this.heading());
    this.persist();
  }

  private persist() {
    const theme: StoredTheme = {
      mode: this.mode(),
      surface: this.surface(),
      heading: this.heading(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  }
}
