import {Injectable, signal, TemplateRef} from '@angular/core';

@Injectable({providedIn: 'root'})
export class RightPanelService {
  readonly template = signal<TemplateRef<any> | null>(null);
  readonly title = signal('');

  open(template: TemplateRef<any>, title = 'Panel'): void {
    this.template.set(template);
    this.title.set(title);
  }

  close(): void {
    this.template.set(null);
  }

  toggle(template: TemplateRef<any>, title = 'Panel'): void {
    if (this.template()) {
      this.close();
    } else {
      this.open(template, title);
    }
  }

  isOpen(): boolean {
    return this.template() !== null;
  }
}
