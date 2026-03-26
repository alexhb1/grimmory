import {ChangeDetectorRef, Component, EventEmitter, inject, Input, OnChanges, Output, SimpleChanges, ViewChild} from '@angular/core';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {TooltipModule} from 'primeng/tooltip';
import {TieredMenu} from 'primeng/tieredmenu';
import {MenuItem, MessageService} from 'primeng/api';
import {AuthorSummary} from '../../model/author.model';
import {AuthorService} from '../../service/author.service';

@Component({
  selector: 'app-author-card',
  standalone: true,
  templateUrl: './author-card.component.html',
  imports: [TranslocoPipe, TooltipModule, TieredMenu]
})
export class AuthorCardComponent implements OnChanges {

  @Input({required: true}) author!: AuthorSummary;
  @Input() canQuickMatch = false;
  @Input() canDelete = false;
  @Input() isCheckboxEnabled = false;
  @Input() isSelected = false;
  @Input() hasSelection = false;
  @Input() index = 0;
  @Input() cacheBuster = 0;

  @Output() cardClick = new EventEmitter<AuthorSummary>();
  @Output() quickMatched = new EventEmitter<AuthorSummary>();
  @Output() checkboxClick = new EventEmitter<{ index: number; author: AuthorSummary; selected: boolean; shiftKey: boolean }>();
  @Output() viewAuthor = new EventEmitter<AuthorSummary>();
  @Output() editAuthor = new EventEmitter<AuthorSummary>();
  @Output() deleteAuthor = new EventEmitter<AuthorSummary>();

  private authorService = inject(AuthorService);
  private messageService = inject(MessageService);
  private t = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);

  hasPhoto = false;
  isImageLoaded = false;
  quickMatching = false;
  menuVisible = false;

  @ViewChild('menu') menuRef: TieredMenu | undefined;

  items: MenuItem[] = [];
  private menuInitialized = false;
  private lastShiftKey = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['author']) {
      const prev = changes['author'].previousValue as AuthorSummary | undefined;
      const curr = changes['author'].currentValue as AuthorSummary;
      if (!prev || prev.id !== curr.id || prev.hasPhoto !== curr.hasPhoto || prev.asin !== curr.asin) {
        this.hasPhoto = curr.hasPhoto;
        this.isImageLoaded = false;
      }
    }
    if (changes['cacheBuster'] && !changes['cacheBuster'].firstChange) {
      this.hasPhoto = true;
      this.isImageLoaded = false;
    }
  }

  get thumbnailUrl(): string {
    return this.authorService.getAuthorThumbnailUrl(this.author.id, this.cacheBuster || undefined);
  }

  onCardClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('.menu-trigger')) return;

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      this.checkboxClick.emit({index: this.index, author: this.author, selected: !this.isSelected, shiftKey: false});
      return;
    }
    event.stopPropagation();
    this.cardClick.emit(this.author);
  }

  onImageLoad(): void {
    this.isImageLoaded = true;
  }

  onPhotoError(): void {
    this.hasPhoto = false;
  }

  captureMouseEvent(event: MouseEvent): void {
    event.stopPropagation();
    this.lastShiftKey = event.shiftKey;
  }

  toggleSelection(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.checkboxClick.emit({index: this.index, author: this.author, selected: checked, shiftKey: this.lastShiftKey});
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

  private initMenu(): void {
    this.items = [
      {
        label: this.t.translate('authorBrowser.card.menu.viewAuthor'),
        icon: 'pi pi-user',
        command: () => this.viewAuthor.emit(this.author)
      },
      ...(this.canQuickMatch ? [
        {
          label: this.t.translate('authorBrowser.card.menu.editAuthor'),
          icon: 'pi pi-pencil',
          command: () => this.editAuthor.emit(this.author)
        },
        {
          label: this.t.translate('authorBrowser.card.menu.quickMatch'),
          icon: this.quickMatching ? 'pi pi-spin pi-spinner' : 'pi pi-bolt',
          disabled: this.quickMatching,
          command: () => this.onQuickMatch()
        }
      ] : []),
      ...(this.canDelete ? [
        {
          label: this.t.translate('authorBrowser.card.menu.deleteAuthor'),
          icon: 'pi pi-trash',
          command: () => this.deleteAuthor.emit(this.author)
        }
      ] : [])
    ];
  }

  private onQuickMatch(): void {
    if (this.quickMatching) return;

    this.quickMatching = true;
    this.authorService.quickMatchAuthor(this.author.id).subscribe({
      next: (updated) => {
        this.quickMatching = false;
        this.author = {...this.author, asin: updated.asin, hasPhoto: true};
        this.hasPhoto = true;
        this.isImageLoaded = false;
        this.menuInitialized = false;
        this.quickMatched.emit(this.author);
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('authorBrowser.toast.quickMatchSuccessSummary'),
          detail: this.t.translate('authorBrowser.toast.quickMatchSuccessDetail')
        });
      },
      error: () => {
        this.quickMatching = false;
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('authorBrowser.toast.quickMatchFailedSummary'),
          detail: this.t.translate('authorBrowser.toast.quickMatchFailedDetail')
        });
      }
    });
  }
}
