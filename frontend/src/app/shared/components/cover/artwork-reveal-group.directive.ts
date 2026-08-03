import {Directive, signal} from '@angular/core';

@Directive({
  selector: '[appArtworkRevealGroup]',
})
export class ArtworkRevealGroupDirective {
  private readonly members = new Set<object>();
  private readonly pending = new Set<object>();
  private readonly revealed = signal(false);

  register(member: object): void {
    if (this.revealed()) {
      return;
    }
    this.members.add(member);
    this.pending.add(member);
  }

  unregister(member: object): void {
    this.members.delete(member);
    if (this.pending.delete(member)) {
      this.revealIfDone();
    }
  }

  ready(member: object): void {
    if (this.pending.delete(member)) {
      this.revealIfDone();
    }
  }

  revealFor(member: object): boolean | null {
    return this.members.has(member) ? this.revealed() : null;
  }

  private revealIfDone(): void {
    if (!this.revealed() && this.pending.size === 0 && this.members.size > 0) {
      this.revealed.set(true);
    }
  }
}
