import {HttpErrorResponse} from '@angular/common/http';

export interface APIException {
  status: number;
  message: string;
  timestamp?: string;
  details?: string[];
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const responseBody: unknown = error.error;
    return hasApiErrorMessage(responseBody) ? responseBody.message : fallback;
  }

  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
}

function hasApiErrorMessage(value: unknown): value is {message: string} {
  return typeof value === 'object'
    && value !== null
    && 'message' in value
    && typeof value.message === 'string'
    && value.message.trim().length > 0;
}
