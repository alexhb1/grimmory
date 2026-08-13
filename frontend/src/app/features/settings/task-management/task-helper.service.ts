import {inject, Injectable} from '@angular/core';
import {MessageService} from '@openng/optimus-ui/api';
import {MetadataRefreshRequest} from '../../metadata/model/request/metadata-refresh-request.model';
import {catchError, map} from 'rxjs/operators';
import {of} from 'rxjs';
import {TaskCreateRequest, TaskService, TaskType} from './task.service';
import {TranslocoService} from '@jsverse/transloco';
import {HttpErrorResponse} from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class TaskHelperService {
  private taskService = inject(TaskService);
  private messageService = inject(MessageService);
  private readonly t = inject(TranslocoService);

  refreshMetadataTask(options: MetadataRefreshRequest) {
    const request: TaskCreateRequest = {
      taskType: TaskType.REFRESH_METADATA_MANUAL,
      triggeredByCron: false,
      options
    };
    return this.taskService.startTask(request).pipe(
      map(() => {
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('settingsTasks.toast.metadataScheduled'),
          detail: this.t.translate('settingsTasks.toast.metadataScheduledDetail')
        });
        return {success: true};
      }),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.messageService.add({
            severity: 'error',
            summary: this.t.translate('settingsTasks.toast.alreadyRunning'),
            life: 5000,
            detail: this.t.translate('settingsTasks.toast.metadataAlreadyRunningDetail')
          });
        } else {
          this.messageService.add({
            severity: 'error',
            summary: this.t.translate('settingsTasks.toast.metadataFailed'),
            life: 5000,
            detail: this.t.translate('settingsTasks.toast.metadataFailedDetail')
          });
        }
        return of({success: false});
      })
    );
  }
}
