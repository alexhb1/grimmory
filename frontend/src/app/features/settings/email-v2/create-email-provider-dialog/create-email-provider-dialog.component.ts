import {Component, inject} from '@angular/core';
import {Button} from '@openng/optimus-ui/button';
import {Checkbox} from '@openng/optimus-ui/checkbox';
import {InputText} from '@openng/optimus-ui/inputtext';

import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MessageService} from '@openng/optimus-ui/api';
import {DynamicDialogRef} from '@openng/optimus-ui/dynamicdialog';
import {EmailV2ProviderService} from '../email-v2-provider/email-v2-provider.service';
import {TranslocoDirective, TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {getApiErrorMessage} from '../../../../shared/models/api-exception.model';
import {HttpErrorResponse} from '@angular/common/http';

@Component({
  selector: 'app-create-email-provider-dialog',
  imports: [
    Button,
    Checkbox,
    InputText,
    ReactiveFormsModule,
    TranslocoDirective,
    TranslocoPipe
  ],
  templateUrl: './create-email-provider-dialog.component.html',
  styleUrl: './create-email-provider-dialog.component.scss'
})
export class CreateEmailProviderDialogComponent {
  private readonly fb = inject(FormBuilder).nonNullable;
  private emailProviderService = inject(EmailV2ProviderService);
  private messageService = inject(MessageService);
  private ref = inject(DynamicDialogRef);
  private readonly t = inject(TranslocoService);

  readonly emailProviderForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    host: ['', Validators.required],
    port: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    username: '',
    password: '',
    fromAddress: ['', Validators.email],
    auth: false,
    startTls: false,
  });

  createEmailProvider() {
    if (this.emailProviderForm.invalid) {
      this.messageService.add({
        severity: 'warn',
        summary: this.t.translate('settingsEmail.provider.create.validationError'),
        detail: this.t.translate('settingsEmail.provider.create.validationErrorDetail')
      });
      return;
    }

    const {port, ...emailProviderFields} = this.emailProviderForm.getRawValue();
    if (port === null) return;
    const emailProviderData = {...emailProviderFields, port};

    this.emailProviderService.createEmailProvider(emailProviderData).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('settingsEmail.provider.create.success'),
          detail: this.t.translate('settingsEmail.provider.create.successDetail')
        });
        this.ref.close(true);
      },
      error: (error: unknown) => {
        const fallback = this.t.translate('settingsEmail.provider.create.failedDefault');
        const message = error instanceof HttpErrorResponse
          ? getApiErrorMessage(error, fallback)
          : fallback;
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('settingsEmail.provider.create.failed'),
          detail: message === fallback
            ? fallback
            : this.t.translate('settingsEmail.provider.create.failedDetail', {message}),
        });
      }
    });
  }

  closeDialog(): void {
    this.ref.close();
  }
}
