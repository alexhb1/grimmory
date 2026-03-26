import {Component, DestroyRef, ElementRef, inject, OnInit, viewChild} from '@angular/core';
import {NavigationEnd, NavigationStart, Router, RouterOutlet} from '@angular/router';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {filter} from 'rxjs';
import {AppSidebarComponent} from '../layout-sidebar/app.sidebar.component';
import {AppGlobalSearchComponent} from '../global-search/app.global-search.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, AppSidebarComponent, AppGlobalSearchComponent],
  templateUrl: './app.layout.component.html',
})
export class AppLayoutComponent implements OnInit {
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private mainContent = viewChild.required<ElementRef<HTMLElement>>('mainContent');

  private scrollPositions = new Map<number, number>();
  private navigationId = 0;
  private restoringScroll = false;

  ngOnInit() {
    this.router.events
      .pipe(
        filter((e): e is NavigationStart => e instanceof NavigationStart),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(e => {
        const el = this.mainContent().nativeElement;
        this.scrollPositions.set(this.navigationId, el.scrollTop);
        this.restoringScroll = e.navigationTrigger === 'popstate';
      });

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        const el = this.mainContent().nativeElement;
        if (this.restoringScroll) {
          this.navigationId--;
          const saved = this.scrollPositions.get(this.navigationId) ?? 0;
          requestAnimationFrame(() => el.scrollTop = saved);
        } else {
          this.navigationId++;
          el.scrollTop = 0;
        }
      });
  }
}
