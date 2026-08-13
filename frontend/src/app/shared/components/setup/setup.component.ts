import {Component, inject, signal} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {Router} from '@angular/router';
import {SetupService} from './setup.service';
import {InputText} from '@openng/optimus-ui/inputtext';
import {Button} from '@openng/optimus-ui/button';
import {Message} from '@openng/optimus-ui/message';
import {passwordMatchValidator} from '../../validators/password-match.validator';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {getApiErrorMessage} from '../../models/api-exception.model';

@Component({
  selector: 'app-setup',
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.scss'],
  standalone: true,
  imports: [
    ReactiveFormsModule,
    InputText,
    Button,
    Message,
    TranslocoDirective
  ]
})
export class SetupComponent {
  private fb = inject(FormBuilder);
  private setupService = inject(SetupService);
  private router = inject(Router);
  setupForm = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    username: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]],
  }, {validators: [passwordMatchValidator('password', 'confirmPassword')]});
  loading = signal(false);
  error: string | null = null;
  success = false;
  private readonly t = inject(TranslocoService);

  onSubmit(): void {
    if (this.setupForm.invalid) return;

    this.loading.set(true);
    this.error = null;
    const {name, username, email, password} = this.setupForm.getRawValue();
    const payload = {name, username, email, password};
    this.setupService.createAdmin(payload).subscribe({
      next: () => {
        this.success = true;
        setTimeout(() => {
          this.router.navigate(['/login']).catch((error: unknown) => {
            console.error('Failed to navigate to login after setup:', error);
          });
        }, 1500);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error = getApiErrorMessage(
          error,
          this.t.translate('shared.setup.toast.createFailedDefault')
        );
      },
    });
  }
}
