import {ChangeDetectorRef, Component, EventEmitter, inject, Input, Output, ViewChild} from '@angular/core';
import {TooltipModule} from 'primeng/tooltip';
import {TieredMenu} from 'primeng/tieredmenu';
import {MenuItem} from 'primeng/api';
import {TranslocoService} from '@jsverse/transloco';
import {SeriesSummary} from '../../model/series.model';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {BookService} from '../../../book/service/book.service';
import {CoverPlaceholderComponent} from '../../../../shared/components/cover-generator/cover-generator.component';

@Component({
  selector: 'app-series-card',
  standalone: true,
  templateUrl: './series-card.component.html',
  imports: [TooltipModule, TieredMenu, CoverPlaceholderComponent]
})
export class SeriesCardComponent {

  @Input({required: true}) series!: SeriesSummary;
  @Output() cardClick = new EventEmitter<SeriesSummary>();

  @ViewChild('menu') menuRef: TieredMenu | undefined;

  protected urlHelper = inject(UrlHelperService);
  private bookService = inject(BookService);
  private t = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);

  isImageLoaded = false;
  menuVisible = false;
  items: MenuItem[] = [];
  private menuInitialized = false;

  get progressPercent(): number {
    return Math.round(this.series.progress * 100);
  }

  get authorsDisplay(): string {
    if (!this.series.authors.length) return '';
    if (this.series.authors.length <= 2) return this.series.authors.join(', ');
    return this.series.authors.slice(0, 2).join(', ') + ' +' + (this.series.authors.length - 2);
  }

  get coverUrl(): string {
    const book = this.series.coverBooks[0];
    if (!book) return '';
    const isAudiobook = book.primaryFile?.bookType === 'AUDIOBOOK';
    return isAudiobook
      ? this.urlHelper.getAudiobookThumbnailUrl(book.id, book.metadata?.audiobookCoverUpdatedOn)
      : this.urlHelper.getThumbnailUrl(book.id, book.metadata?.coverUpdatedOn);
  }

  onCardClick(event: MouseEvent): void {
    event.stopPropagation();
    this.cardClick.emit(this.series);
  }

  onMenuClick(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.menuInitialized) {
      this.menuInitialized = true;
      this.initMenu();
      this.cdr.markForCheck();
    }
    this.menuRef?.toggle(event);
  }

  onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.menuInitialized) {
      this.menuInitialized = true;
      this.initMenu();
      this.cdr.markForCheck();
    }
    const menu = this.menuRef;
    if (!menu) return;
    const anchor = document.createElement('span');
    anchor.style.cssText = `position:fixed;left:${event.clientX}px;top:${event.clientY}px;width:0;height:0;pointer-events:none;`;
    document.body.appendChild(anchor);
    menu.toggle({...event, currentTarget: anchor, target: anchor} as any);
    requestAnimationFrame(() => anchor.remove());
  }

  onMenuShow(): void {
    this.menuVisible = true;
  }

  onMenuHide(): void {
    this.menuVisible = false;
  }

  onImageLoad(): void {
    this.isImageLoaded = true;
  }

  readNext(event: MouseEvent): void {
    event.stopPropagation();
    if (this.series.nextUnread) {
      this.bookService.readBook(this.series.nextUnread.id);
    }
  }

  private initMenu(): void {
    this.items = [
      {
        label: this.t.translate('seriesBrowser.menu.viewSeries'),
        icon: 'pi pi-list',
        command: () => this.cardClick.emit(this.series)
      },
      ...(this.series.nextUnread ? [{
        label: this.t.translate('seriesBrowser.menu.readNext'),
        icon: 'pi pi-book',
        command: () => {
          if (this.series.nextUnread) {
            this.bookService.readBook(this.series.nextUnread.id);
          }
        }
      }] : [])
    ];
  }
}
