export function normalizeSearchTerm(str: string): string {
  if (!str) return '';
  let s = str.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/ø/gi, 'o')
       .replace(/ł/gi, 'l')
       .replace(/æ/gi, 'ae')
       .replace(/œ/gi, 'oe')
       .replace(/ß/g, 'ss');
  s = s.replace(/[!@$%^&*_=|~`<>?/";']/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s.toLowerCase();
}
