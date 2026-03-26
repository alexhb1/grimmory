import {Component, inject} from '@angular/core';
import {ModalRef} from '../../../../../shared/components/ui/modal/modal.service';
import {MODAL_DATA} from '../../../../../shared/components/ui/modal/modal-host';
import {MetadataRefreshRequest} from '../../../model/request/metadata-refresh-request.model';
import {MetadataRefreshType} from '../../../model/request/metadata-refresh-type.enum';
import {MetadataRefreshOptions} from '../../../model/request/metadata-refresh-options.model';
import {AppSettingsService} from '../../../../../shared/service/app-settings.service';
import {MetadataAdvancedFetchOptionsComponent} from '../metadata-advanced-fetch-options/metadata-advanced-fetch-options.component';
import {TaskHelperService} from '../../../../settings/task-management/task-helper.service';
import {TranslocoDirective} from '@jsverse/transloco';
import {ButtonComponent} from '../../../../../shared/components/ui/button/button';

@Component({
  selector: 'app-metadata-fetch-options',
  standalone: true,
  templateUrl: './metadata-fetch-options.component.html',
  imports: [
    MetadataAdvancedFetchOptionsComponent,
    TranslocoDirective,
    ButtonComponent,
  ],
  host: {class: 'flex flex-col flex-1 min-h-0'}
})
export class MetadataFetchOptionsComponent {
  libraryId!: number;
  bookIds!: number[];
  metadataRefreshType!: MetadataRefreshType;
  currentMetadataOptions!: MetadataRefreshOptions;

  readonly modalRef = inject(ModalRef);
  private data = inject(MODAL_DATA) as { libraryId?: number; bookIds?: number[]; metadataRefreshType?: MetadataRefreshType } | null;
  private taskHelperService = inject(TaskHelperService);
  private appSettingsService = inject(AppSettingsService);

  constructor() {
    this.libraryId = this.data?.libraryId!;
    this.bookIds = this.data?.bookIds!;
    this.metadataRefreshType = this.data?.metadataRefreshType!;
    const settings = this.appSettingsService.appSettings();
    if (settings) {
      this.currentMetadataOptions = settings.defaultMetadataRefreshOptions;
    }
  }

  onMetadataSubmit(metadataRefreshOptions: MetadataRefreshOptions) {
    const metadataRefreshRequest: MetadataRefreshRequest = {
      refreshType: this.metadataRefreshType,
      refreshOptions: metadataRefreshOptions,
      bookIds: this.bookIds,
      libraryId: this.libraryId
    };
    this.taskHelperService.refreshMetadataTask(metadataRefreshRequest).subscribe();
    this.modalRef.close();
  }
}
