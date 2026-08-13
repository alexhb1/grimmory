export enum Severity {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export interface LogNotification {
  timestamp?: string;
  message: string;
  severity?: Severity;
}

export function parseLogNotification(messageBody: string): LogNotification {
  const raw: unknown = JSON.parse(messageBody);
  if (!isRecord(raw) || typeof raw['message'] !== 'string') {
    throw new TypeError('Invalid log WebSocket message');
  }

  const timestamp = parseTimestamp(raw['timestamp']);
  const severity = parseSeverity(raw['severity']);
  return {
    timestamp,
    message: raw['message'],
    severity,
  };
}

function parseTimestamp(value: unknown): string | undefined {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleTimeString()
    : undefined;
}

function parseSeverity(value: unknown): Severity | undefined {
  if (value === Severity.INFO || value === Severity.WARN || value === Severity.ERROR) {
    return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
