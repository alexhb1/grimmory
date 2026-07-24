export const SEARCH_DEBOUNCE_MS = 200;

export function normalizeRemoteSearchTerm(str: string): string {
  return str
    .replace(/[!@$%^&*_=|~`<>?/";']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeLocalSearchTerm(str: string): string {
  const folded = str.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o')
    .replace(/ł/gi, 'l')
    .replace(/æ/gi, 'ae')
    .replace(/œ/gi, 'oe')
    .replace(/ß/g, 'ss');
  return normalizeRemoteSearchTerm(folded).toLowerCase();
}
