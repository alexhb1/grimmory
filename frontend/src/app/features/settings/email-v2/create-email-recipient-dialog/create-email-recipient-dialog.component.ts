import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MessageService} from '@openng/optimus-ui/api';
import {DynamicDialogRef} from '@openng/optimus-ui/dynamicdialog';
import {Checkbox} from '@openng/optimus-ui/checkbox';
import {Button} from '@openng/optimus-ui/button';
import {InputText} from '@openng/optimus-ui/inputtext';
import {EmailV2RecipientService} from '../email-v2-recipient/email-v2-recipient.service';
import {Tooltip} from '@openng/optimus-ui/tooltip';
import {TranslocoDirective, TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {getApiErrorMessage} from '../../../../shared/models/api-exception.model';
import {HttpErrorResponse} from '@angular/common/http';

@Component({
  selector: 'app-create-email-recipient-dialog',
  imports: [
    Checkbox,
    ReactiveFormsModule,
    Button,
    InputText,
    Tooltip,
    TranslocoDirective,
    TranslocoPipe
  ],
  templateUrl: './create-email-recipient-dialog.component.html',
  styleUrls: ['./create-email-recipient-dialog.component.scss']
})
export class CreateEmailRecipientDialogComponent {
  private readonly fb = inject(FormBuilder).nonNullable;
  private emailRecipientService = inject(EmailV2RecipientService);
  private messageService = inject(MessageService);
  private ref = inject(DynamicDialogRef);
  private readonly t = inject(TranslocoService);

  readonly emailRecipientForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    defaultRecipient: false,
  });

  closeDialog(): void {
    this.ref.close();
  }

  createEmailRecipient(): void {
    if (this.emailRecipientForm.invalid) {
      this.messageService.add({
        severity: 'warn',
        summary: this.t.translate('settingsEmail.recipient.create.validationError'),
        detail: this.t.translate('settingsEmail.recipient.create.validationErrorDetail')
      });
      return;
    }

    const emailRecipientData = this.emailRecipientForm.getRawValue();

    this.emailRecipientService.createRecipient(emailRecipientData).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('settingsEmail.recipient.create.success'),
          detail: this.t.translate('settingsEmail.recipient.create.successDetail', {name: emailRecipientData.name})
        });
        this.ref.close(true);
      },
      error: (error: unknown) => {
        const fallback = this.t.translate('settingsEmail.recipient.create.failedDefault');
        const message = error instanceof HttpErrorResponse
          ? getApiErrorMessage(error, fallback)
          : fallback;
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('settingsEmail.recipient.create.failed'),
          detail: message === fallback
            ? fallback
            : this.t.translate('settingsEmail.recipient.create.failedDetail', {message}),
        });
      }
    });
  }
}
