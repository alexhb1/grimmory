import {AuthorPhotoResult, AuthorSummary} from '../model/author.model';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAuthorSummary(value: unknown): value is AuthorSummary {
  return isRecord(value)
    && typeof value['id'] === 'number'
    && typeof value['name'] === 'string'
    && (value['asin'] === undefined || typeof value['asin'] === 'string')
    && typeof value['bookCount'] === 'number'
    && typeof value['hasPhoto'] === 'boolean';
}

function isAuthorPhotoResult(value: unknown): value is AuthorPhotoResult {
  return isRecord(value)
    && typeof value['url'] === 'string'
    && typeof value['width'] === 'number'
    && typeof value['height'] === 'number'
    && typeof value['index'] === 'number';
}

function parseMessage<T>(event: Event, streamName: string, isValid: (value: unknown) => value is T): T {
  if (event.type === 'error') {
    const message = event instanceof ErrorEvent && event.message ? event.message : `${streamName} request failed`;
    throw new Error(message);
  }

  if (!(event instanceof MessageEvent) || typeof event.data !== 'string') {
    throw new Error(`Invalid ${streamName} message`);
  }

  const payload: unknown = JSON.parse(event.data);
  if (!isValid(payload)) {
    throw new Error(`Invalid ${streamName} payload`);
  }
  return payload;
}

export function parseAuthorSummaryMessage(event: Event): AuthorSummary {
  return parseMessage(event, 'author auto-match SSE', isAuthorSummary);
}

export function parseAuthorPhotoMessage(event: Event): AuthorPhotoResult {
  return parseMessage(event, 'author photo SSE', isAuthorPhotoResult);
}
