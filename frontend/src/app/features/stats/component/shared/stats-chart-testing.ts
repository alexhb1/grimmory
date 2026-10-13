import {signal, type Type} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {TranslocoService} from '@jsverse/transloco';
import {BehaviorSubject} from 'rxjs';

import {STATS_CARD, type StatsCardState} from '../../card/stats-context';

const STATS_TEXT_TESTING_PROVIDER = {
  provide: TranslocoService,
  useValue: {
    translate: (key: string) => key,
    langChanges$: new BehaviorSubject('en'),
    getActiveLang: () => 'en',
  },
};

export const STATS_CARD_TESTING_PROVIDER = {
  provide: STATS_CARD,
  useValue: {state: signal<StatsCardState>('ready').asReadonly(), description: signal('').asReadonly()},
};

export function createStatsChart<T>(component: Type<T>, data: unknown): T {
  TestBed.configureTestingModule({imports: [component], providers: [STATS_TEXT_TESTING_PROVIDER]});
  TestBed.overrideComponent(component, {set: {template: '', imports: []}});
  const fixture = TestBed.createComponent(component);
  fixture.componentRef.setInput('data', data);
  return fixture.componentInstance;
}

export function insightPairs(insights: readonly {readonly label: string; readonly value: string}[]): string[][] {
  return insights.map(({label, value}) => [label.split('.').at(-1) ?? label, value]);
}

