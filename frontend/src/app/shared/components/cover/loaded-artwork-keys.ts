import {Injectable} from '@angular/core';

@Injectable({providedIn: 'root'})
export class LoadedArtworkKeys {
  private readonly readyKeys = new Set<string>();

  has(key: string): boolean {
    return this.readyKeys.has(key);
  }

  add(key: string): void {
    this.readyKeys.add(key);
  }
}
