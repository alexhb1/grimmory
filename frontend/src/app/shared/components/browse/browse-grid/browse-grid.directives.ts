import {Directive, TemplateRef, inject, input} from '@angular/core';

export interface BrowseGridItemContext<T> {
  $implicit: T;
  index: number;
}

@Directive({
  selector: 'ng-template[appBrowseGridItemOf]',
  standalone: true,
})
export class BrowseGridItemDef<T> {
  readonly templateRef = inject(TemplateRef) as TemplateRef<BrowseGridItemContext<T>>;
  readonly items = input.required<readonly (T | undefined)[]>({alias: 'appBrowseGridItemOf'});

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- params exist purely for the type predicate
  static ngTemplateContextGuard<T>(dir: BrowseGridItemDef<T>, ctx: unknown): ctx is BrowseGridItemContext<T> {
    return true;
  }
}

@Directive({
  selector: 'ng-template[appBrowseGridSkeleton]',
  standalone: true,
})
export class BrowseGridSkeletonDef {
  readonly templateRef = inject<TemplateRef<unknown>>(TemplateRef);
}

@Directive({
  selector: 'ng-template[appBrowseGridEmpty]',
  standalone: true,
})
export class BrowseGridEmptyDef {
  readonly templateRef = inject<TemplateRef<unknown>>(TemplateRef);
}
