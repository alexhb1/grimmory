import {Component, Input, inject} from '@angular/core';
import {BookCardComponent} from '../../../book/components/book-browser/book-card/book-card.component';
import {Book} from '../../../book/model/book.model';
import {ScrollerType} from '../../models/dashboard-config.model';
import {BookCardOverlayPreferenceService} from '../../../book/components/book-browser/book-card-overlay-preference.service';
import {TranslocoPipe} from '@jsverse/transloco';

@Component({
  selector: 'app-dashboard-scroller',
  standalone: true,
  imports: [BookCardComponent, TranslocoPipe],
  template: `
    <section class="mb-10">
      <h2 class="font-heading text-xl font-bold text-ink tracking-tight mb-4">
        {{ title | transloco }}
        @if (isMagicShelf) {
          <i class="pi pi-sparkles text-accent ml-1.5 text-sm"></i>
        }
      </h2>

      @if (!books || books.length === 0) {
        <div class="flex items-center justify-center py-12 text-ink-muted text-sm">
          <i class="pi pi-book mr-2"></i>
          No books found
        </div>
      } @else {
        <div class="overflow-x-auto scrollbar-hide">
          <div class="flex gap-4 pb-8 pt-1">
            @for (book of books; track book.id) {
              <app-book-card
                class="w-[140px] flex-shrink-0"
                [book]="book"
                [isCheckboxEnabled]="false"
                [forceEbookMode]="forceEbookMode"
                [useSquareCovers]="useSquareCovers"
                [overlayPreferenceService]="bookCardOverlayPreferenceService"
                (menuToggled)="handleMenuToggle(book.id, $event)"
              />
            }
          </div>
        </div>
      }
    </section>
  `,
})
export class DashboardScrollerComponent {
  @Input() bookListType: ScrollerType | null = null;
  @Input() title!: string;
  @Input() books!: Book[] | null;
  @Input() isMagicShelf: boolean = false;
  @Input() useSquareCovers: boolean = false;

  bookCardOverlayPreferenceService = inject(BookCardOverlayPreferenceService);

  get forceEbookMode(): boolean {
    return this.bookListType === ScrollerType.LAST_READ;
  }

  handleMenuToggle(bookId: number, isOpen: boolean) {
    // Reserved for future use (e.g. preventing scroll while menu is open)
  }
}
