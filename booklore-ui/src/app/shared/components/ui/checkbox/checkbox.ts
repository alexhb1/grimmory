import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-checkbox',
  standalone: true,
  imports: [FormsModule],
  host: { class: 'block' },
  template: `
    <label class="flex items-center gap-2 cursor-pointer" [class.opacity-50]="disabled()" [class.pointer-events-none]="disabled()">
      <input
        type="checkbox"
        [ngModel]="checked()"
        (ngModelChange)="checked.set($event)"
        [disabled]="disabled()"
        class="h-4 w-4 rounded-[3px] border border-edge bg-surface-raised text-accent accent-accent focus:ring-1 focus:ring-accent/20 cursor-pointer disabled:cursor-not-allowed"
      />
      <ng-content />
    </label>
  `,
})
export class CheckboxComponent {
  checked = model(false);
  disabled = input(false);
}
