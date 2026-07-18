import {describe, expect, it} from 'vitest';

import {withBrowseCursorOffset} from './browse-cursor';

function encode(state: Record<string, unknown>): string {
  return btoa(JSON.stringify(state)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(cursor: string): Record<string, unknown> {
  const padded = cursor.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(padded + '='.repeat((4 - padded.length % 4) % 4))) as Record<string, unknown>;
}

describe('withBrowseCursorOffset', () => {
  it('patches only the offset field', () => {
    const cursor = encode({o: 0, l: 60, s: 'title', f: 'abc123def456'});

    expect(decode(withBrowseCursorOffset(cursor, 5940)))
      .toEqual({o: 5940, l: 60, s: 'title', f: 'abc123def456'});
  });

  it('emits unpadded url-safe base64', () => {
    const cursor = withBrowseCursorOffset(encode({o: 0, l: 60, s: 'title', f: 'x'}), 7);

    expect(cursor).not.toMatch(/[+/=]/);
  });

});
