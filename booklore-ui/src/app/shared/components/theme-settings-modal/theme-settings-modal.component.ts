import { Component, inject } from '@angular/core';
import { ThemeService } from '../../service/theme.service';
import { ModalRef } from '../ui/modal/modal.service';
import { SelectButtonComponent } from '../ui/select-button/select-button';

@Component({
  selector: 'app-theme-settings-modal',
  standalone: true,
  imports: [SelectButtonComponent],
  template: `
    <div class="overflow-y-auto px-6 py-1 pb-6" (scroll)="modalRef.reportScroll($event)">
      <div class="space-y-6">
        <div>
          <h3 class="text-[15px] font-semibold text-ink mb-2">Colour Mode</h3>
          <app-select-button
            [options]="colourModeOptions"
            [value]="theme.mode()"
            (valueChange)="theme.setMode($any($event))"
          />
          <p class="text-xs text-ink-muted mt-1.5">Choose your preferred colour scheme.</p>
        </div>

        <div class="border-t border-edge-light pt-6">
          <h3 class="text-[15px] font-semibold text-ink mb-2">Surface</h3>
          <app-select-button
            [options]="surfaceOptions"
            [value]="theme.surface()"
            (valueChange)="theme.setSurface($any($event))"
          />
          <p class="text-xs text-ink-muted mt-1.5">Controls the background hue and accent colour.</p>
        </div>

        <div class="border-t border-edge-light pt-6">
          <h3 class="text-[15px] font-semibold text-ink mb-2">Heading Font</h3>
          <app-select-button
            [options]="headingFontOptions"
            [value]="theme.heading()"
            (valueChange)="theme.setHeading($any($event))"
          />
          <p class="text-xs text-ink-muted mt-1.5">Font used for page titles, section headings, and the app logo.</p>
        </div>
      </div>
    </div>
  `,
})
export class ThemeSettingsModalComponent {
  readonly theme = inject(ThemeService);
  readonly modalRef = inject(ModalRef);

  colourModeOptions = [
    { label: 'Dark', value: 'dark' },
    { label: 'Light', value: 'light' },
  ];

  surfaceOptions = [
    { label: 'Default', value: 'default', swatch: '#a8a29e' },
    { label: 'Slate', value: 'slate', swatch: '#38bdf8' },
    { label: 'Neutral', value: 'neutral', swatch: '#a1a1aa' },
  ];

  headingFontOptions = [
    { label: 'Serif', value: 'serif' },
    { label: 'Sans-serif', value: 'sans' },
  ];
}
