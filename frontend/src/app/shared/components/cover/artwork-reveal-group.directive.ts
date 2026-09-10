import {Directive, signal} from '@angular/core';

import {type CoverComponent} from './cover.component';

@Directive({
  selector: '[appArtworkRevealGroup]',
})
export class ArtworkRevealGroupDirective {
  private readonly members = new Set<CoverComponent>();
  private readonly pending = new Set<CoverComponent>();
  private readonly revealed = signal(false);

  register(member: CoverComponent): void {
    if (this.revealed()) {
      return;
    }
    this.members.add(member);
    this.pending.add(member);
  }

  unregister(member: CoverComponent): void {
    this.members.delete(member);
    if (this.pending.delete(member)) {
      this.revealIfDone();
    }
  }

  ready(member: CoverComponent): void {
    if (this.pending.delete(member)) {
      this.revealIfDone();
    }
  }

  revealFor(member: CoverComponent): boolean | null {
    return this.members.has(member) ? this.revealed() : null;
  }

  private revealIfDone(): void {
    if (!this.revealed() && this.pending.size === 0 && this.members.size > 0) {
      this.revealed.set(true);
    }
  }
}
