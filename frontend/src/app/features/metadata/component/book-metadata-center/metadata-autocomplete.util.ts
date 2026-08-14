import {AbstractControl} from '@angular/forms';
import {AutoCompleteSelectEvent} from '@openng/optimus-ui/autocomplete';

export function addSelectedAutocompleteValue(control: AbstractControl | null, event: AutoCompleteSelectEvent): void {
  const value: unknown = event.value;
  if (typeof value !== 'string') return;

  addUniqueValue(control, value);

  const target = event.originalEvent.target;
  if (target instanceof HTMLInputElement) {
    target.value = '';
  }
}

export function addEnteredAutocompleteValue(control: AbstractControl | null, event: KeyboardEvent): void {
  if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return;

  const value = event.target.value.trim();
  if (!value) return;

  addUniqueValue(control, value);
  event.target.value = '';
}

function addUniqueValue(control: AbstractControl | null, value: string): void {
  const currentValue: unknown = control?.value;
  const values = isStringArray(currentValue) ? currentValue : [];

  if (!values.includes(value)) {
    control?.setValue([...values, value]);
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}
