/* records/icons.jsx — inline SVG icon set, Lucide-weight (1.4–1.6px stroke).
 * Superset of the integrity-console icons plus record-screen glyphs.
 * Exports window.RICONS. */
const S = (p, d) => p?.size || d || 14;
const RICONS = {
  shield: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 1L2 3.5v4C2 10.5 7 13 7 13s5-2.5 5-5.5v-4z" /></svg>
  ),
  table: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="1" y="1" width="12" height="12" rx="1" /><line x1="1" y1="5" x2="13" y2="5" /><line x1="5" y1="5" x2="5" y2="13" /></svg>
  ),
  layers: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><polygon points="7,1 13,5 7,9 1,5" /><polyline points="1,9 7,13 13,9" /></svg>
  ),
  terminal: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><polyline points="2,4 6,7 2,10" /><line x1="7" y1="10" x2="12" y2="10" /></svg>
  ),
  refresh: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4A6 6 0 102 7" /><polyline points="12,1 12,4 9,4" /></svg>
  ),
  chevron: (p) => (
    <svg width={S(p, 12)} height={S(p, 12)} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: p?.open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 120ms ease' }}><polyline points="4,2 8,6 4,10" /></svg>
  ),
  sun: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="7" cy="7" r="2.5" /><line x1="7" y1="1" x2="7" y2="2" /><line x1="7" y1="12" x2="7" y2="13" /><line x1="1" y1="7" x2="2" y2="7" /><line x1="12" y1="7" x2="13" y2="7" /><line x1="2.8" y1="2.8" x2="3.5" y2="3.5" /><line x1="10.5" y1="10.5" x2="11.2" y2="11.2" /><line x1="2.8" y1="11.2" x2="3.5" y2="10.5" /><line x1="10.5" y1="3.5" x2="11.2" y2="2.8" /></svg>
  ),
  moon: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M12 8A5 5 0 016 2a7 7 0 100 10 5 5 0 016-4z" /></svg>
  ),
  arrowRight: (p) => (
    <svg width={S(p, 13)} height={S(p, 13)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="7" x2="11" y2="7" /><polyline points="7.5,3.5 11,7 7.5,10.5" /></svg>
  ),
  arrowLeft: (p) => (
    <svg width={S(p, 13)} height={S(p, 13)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="7" x2="3" y2="7" /><polyline points="6.5,3.5 3,7 6.5,10.5" /></svg>
  ),
  check: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5,7.5 5.5,10.5 11.5,3.5" /></svg>
  ),
  x: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="3.5" y1="3.5" x2="10.5" y2="10.5" /><line x1="10.5" y1="3.5" x2="3.5" y2="10.5" /></svg>
  ),
  lock: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="9" height="6.5" rx="1.2" /><path d="M4.5 6V4.2a2.5 2.5 0 015 0V6" /></svg>
  ),
  search: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="4" /><line x1="9" y1="9" x2="12.5" y2="12.5" /></svg>
  ),
  plus: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="2.5" x2="7" y2="11.5" /><line x1="2.5" y1="7" x2="11.5" y2="7" /></svg>
  ),
  eye: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M1 7s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" /><circle cx="7" cy="7" r="1.6" /></svg>
  ),
  eyeOff: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 3.2A6 6 0 017 3c3.8 0 6 4 6 4a10 10 0 01-1.7 2M3.3 3.3C1.7 4.4 1 7 1 7s2.2 4 6 4a6 6 0 002-.35" /><path d="M6 6a1.6 1.6 0 002 2" /><line x1="2" y1="2" x2="12" y2="12" /></svg>
  ),
  edit: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2.5l2 2L5 11l-2.5.5L3 9z" /><line x1="8.5" y1="3.5" x2="10.5" y2="5.5" /></svg>
  ),
  trash: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><line x1="2.5" y1="3.5" x2="11.5" y2="3.5" /><path d="M3.5 3.5V11a1 1 0 001 1h5a1 1 0 001-1V3.5" /><path d="M5.5 3.5V2.5a1 1 0 011-1h1a1 1 0 011 1v1" /><line x1="6" y1="6" x2="6" y2="10" /><line x1="8" y1="6" x2="8" y2="10" /></svg>
  ),
  copy: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="4.5" width="7" height="7" rx="1.2" /><path d="M2.5 9.5V3a1 1 0 011-1h6" /></svg>
  ),
  clock: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="5.5" /><polyline points="7,3.8 7,7 9.4,8.4" /></svg>
  ),
  hash: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><line x1="4.5" y1="2" x2="3.5" y2="12" /><line x1="10.5" y1="2" x2="9.5" y2="12" /><line x1="2" y1="5" x2="12" y2="5" /><line x1="2" y1="9" x2="12" y2="9" /></svg>
  ),
  list: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="3.5" x2="12" y2="3.5" /><line x1="5" y1="7" x2="12" y2="7" /><line x1="5" y1="10.5" x2="12" y2="10.5" /><circle cx="2.4" cy="3.5" r="0.7" fill="currentColor" stroke="none" /><circle cx="2.4" cy="7" r="0.7" fill="currentColor" stroke="none" /><circle cx="2.4" cy="10.5" r="0.7" fill="currentColor" stroke="none" /></svg>
  ),
  braces: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 2c-1.2 0-1.5.8-1.5 1.6V5c0 .8-.5 1.5-1.5 2 1 .5 1.5 1.2 1.5 2v1.4C4 11.2 4.3 12 5.5 12" /><path d="M8.5 2c1.2 0 1.5.8 1.5 1.6V5c0 .8.5 1.5 1.5 2-1 .5-1.5 1.2-1.5 2v1.4c0 .8-.3 1.6-1.5 1.6" /></svg>
  ),
  sigma: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="10.5,2.5 3.5,2.5 7,7 3.5,11.5 10.5,11.5" /></svg>
  ),
  tag: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 1.5H2.5A1 1 0 001.5 2.5V7L7 12.5 12.5 7z" /><circle cx="4.4" cy="4.4" r="0.8" fill="currentColor" stroke="none" /></svg>
  ),
  globe: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="5.5" /><line x1="1.5" y1="7" x2="12.5" y2="7" /><path d="M7 1.5c1.6 1.6 2.4 3.5 2.4 5.5S8.6 10.9 7 12.5C5.4 10.9 4.6 9 4.6 7S5.4 3.1 7 1.5z" /></svg>
  ),
  key: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="4.5" cy="9.5" r="2.5" /><line x1="6.3" y1="7.7" x2="12" y2="2" /><line x1="9.5" y1="4.5" x2="11" y2="6" /><line x1="11" y1="3" x2="12.5" y2="4.5" /></svg>
  ),
  alert: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 1.5l5.5 9.5h-11z" /><line x1="7" y1="5.5" x2="7" y2="8" /><circle cx="7" cy="9.6" r="0.4" fill="currentColor" stroke="none" /></svg>
  ),
  bolt: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><polygon points="7.5,1 3,8 6.5,8 6,13 11,6 7,6" /></svg>
  ),
  more: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="currentColor"><circle cx="3" cy="7" r="1.1" /><circle cx="7" cy="7" r="1.1" /><circle cx="11" cy="7" r="1.1" /></svg>
  ),
  save: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 2.5h7l2 2V11a.5.5 0 01-.5.5h-9A.5.5 0 011.5 11V3a.5.5 0 01.5-.5z" /><path d="M4 2.5v3h5v-3" /><rect x="4.5" y="8" width="5" height="3" /></svg>
  ),
  external: (p) => (
    <svg width={S(p)} height={S(p)} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 2.5H3.5A1 1 0 002.5 3.5v7a1 1 0 001 1h7a1 1 0 001-1V7" /><polyline points="8.5,2.5 11.5,2.5 11.5,5.5" /><line x1="11.5" y1="2.5" x2="6.5" y2="7.5" /></svg>
  ),
};
window.RICONS = RICONS;
