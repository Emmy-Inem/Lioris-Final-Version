/** Small helpers for the admin "Add / edit campus" form. The server validates again; these only make typing easier. */

const STOP_WORDS = new Set(['of', 'the', 'and', 'for', 'at', 'in']);
const GENERIC_WORDS = new Set(['university', 'college', 'polytechnic', 'institute', 'federal', 'state', 'national', 'technology', 'science']);
const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

/** "Federal University of Technology Akure" -> "FUTA"; short names fall back to the longest word. */
export function suggestCampusCode(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w.toLowerCase()));
  if (words.length === 0) return '';
  const initials = words.map((w) => w[0]).join('').toUpperCase();
  if (initials.length >= 3) return initials.slice(0, 8);
  const distinctive = words.filter((w) => !GENERIC_WORDS.has(w.toLowerCase()));
  const pool = distinctive.length > 0 ? distinctive : words;
  const longest = pool.reduce((a, b) => (b.length > a.length ? b : a), '');
  return longest.toUpperCase().slice(0, 6);
}

/** Accepts "@lasu.edu.ng", "student@LASU.edu.ng", "https://www.lasu.edu.ng/about" -> "lasu.edu.ng". */
export function normaliseDomainInput(input: string): string {
  let v = input.trim().toLowerCase();
  v = v.replace(/^[a-z]+:\/\//, '');
  const at = v.lastIndexOf('@');
  if (at >= 0) v = v.slice(at + 1);
  v = v.split(/[/?#\s]/)[0];
  v = v.replace(/^www\./, '').replace(/\.+$/, '');
  return v;
}

export function isPlausibleDomain(domain: string): boolean {
  return DOMAIN_RE.test(domain);
}

export const CAMPUS_COLORS = ['#1D4ED8', '#047857', '#B45309', '#7C3AED', '#DC2626', '#0E7490', '#BE185D', '#4D7C0F', '#334155', '#EA580C'];

export function isValidHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

export function isValidCampusCode(code: string): boolean {
  return /^[A-Z][A-Z0-9]{1,15}$/.test(code.trim().toUpperCase()) && code.trim().toUpperCase() !== 'GLOBAL';
}
