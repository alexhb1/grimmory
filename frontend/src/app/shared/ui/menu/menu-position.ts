import { type ConnectedPosition } from '@angular/cdk/overlay';

const GAP = 4;

export const submenuOverlayPositions: ConnectedPosition[] = [
  { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top', offsetX: GAP },
  { originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'top', offsetX: -GAP },
  { originX: 'end', originY: 'bottom', overlayX: 'start', overlayY: 'bottom', offsetX: GAP },
  { originX: 'start', originY: 'bottom', overlayX: 'end', overlayY: 'bottom', offsetX: -GAP },
];
