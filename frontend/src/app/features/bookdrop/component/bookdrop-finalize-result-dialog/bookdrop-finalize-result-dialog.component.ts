import {Component, inject, OnDestroy} from '@angular/core';
import {DatePipe, NgClass} from '@angular/common';
import {BookdropFinalizeResult} from '../../service/bookdrop.service';
import {DynamicDialogConfig, DynamicDialogRef} from "@openng/optimus-ui/dynamicdialog";
import {Button} from '@openng/optimus-ui/button';
import {TranslocoDirective} from '@jsverse/transloco';

export interface BookdropFinalizeResultDialogData {
  result: BookdropFinalizeResult;
}

@Component({
  selector: 'app-bookdrop-finalize-result-dialog',
  imports: [
    NgClass,
    DatePipe,
    Button,
    TranslocoDirective
  ],
  templateUrl: './bookdrop-finalize-result-dialog.component.html',
  styleUrl: './bookdrop-finalize-result-dialog.component.scss'
})
export class BookdropFinalizeResultDialogComponent implements OnDestroy {
  public ref = inject(DynamicDialogRef);
  private readonly config = inject<DynamicDialogConfig<BookdropFinalizeResultDialogData>>(DynamicDialogConfig);

  readonly result: BookdropFinalizeResult;

  constructor() {
    const result = this.config.data?.result;
    if (!result) {
      throw new Error('Bookdrop finalize result dialog requires result data');
    }
    this.result = result;
  }

  ngOnDestroy(): void {
    this.ref?.close();
  }
}
