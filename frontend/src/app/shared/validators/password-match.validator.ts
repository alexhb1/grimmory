import {AbstractControl, ValidationErrors, ValidatorFn} from '@angular/forms';

export const passwordMatchValidator = (
  passwordControlName: string,
  confirmPasswordControlName: string
): ValidatorFn => (control: AbstractControl): ValidationErrors | null => {
  const password: unknown = control.get(passwordControlName)?.value;
  const confirmPassword: unknown = control.get(confirmPasswordControlName)?.value;

  if (!password || !confirmPassword) return null;

  return password === confirmPassword ? null : {passwordMismatch: true};
};
