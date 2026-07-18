export function withBrowseCursorOffset(cursor: string, offset: number): string {
  const state = JSON.parse(decodeBase64Url(cursor)) as Record<string, unknown>;
  state['o'] = offset;
  return encodeBase64Url(JSON.stringify(state));
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded + '='.repeat((4 - padded.length % 4) % 4));
}

function encodeBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
