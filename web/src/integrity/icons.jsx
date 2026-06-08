/* icons.jsx — small inline SVG icon set, Lucide-weight (1.5px stroke).
 * Exports window.ICONS. */
const ICONS = {
  shield: (p) => (
    <svg width={p?.size || 14} height={p?.size || 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 1L2 3.5v4C2 10.5 7 13 7 13s5-2.5 5-5.5v-4z" />
    </svg>
  ),
  table: (p) => (
    <svg width={p?.size || 14} height={p?.size || 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="1" y="1" width="12" height="12" rx="1" /><line x1="1" y1="5" x2="13" y2="5" /><line x1="5" y1="5" x2="5" y2="13" /></svg>
  ),
  layers: (p) => (
    <svg width={p?.size || 14} height={p?.size || 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><polygon points="7,1 13,5 7,9 1,5" /><polyline points="1,9 7,13 13,9" /></svg>
  ),
  terminal: (p) => (
    <svg width={p?.size || 14} height={p?.size || 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><polyline points="2,4 6,7 2,10" /><line x1="7" y1="10" x2="12" y2="10" /></svg>
  ),
  database: (p) => (
    <svg width={p?.size || 14} height={p?.size || 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><ellipse cx="7" cy="3" rx="5" ry="2" /><path d="M2 3v8c0 1.1 2.24 2 5 2s5-.9 5-2V3" /><path d="M2 7c0 1.1 2.24 2 5 2s5-.9 5-2" /></svg>
  ),
  refresh: (p) => (
    <svg width={p?.size || 14} height={p?.size || 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4A6 6 0 102 7" /><polyline points="12,1 12,4 9,4" /></svg>
  ),
  wrench: (p) => (
    <svg width={p?.size || 14} height={p?.size || 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 1.5a3 3 0 00-3.9 3.8L1.6 9.3a1.3 1.3 0 001.8 1.8l4-4a3 3 0 003.8-3.9L11 5.1 8.9 5 8.8 2.9z" /></svg>
  ),
  chevron: (p) => (
    <svg width={p?.size || 12} height={p?.size || 12} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: p?.open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 120ms ease' }}><polyline points="4,2 8,6 4,10" /></svg>
  ),
  sun: (p) => (
    <svg width={p?.size || 14} height={p?.size || 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="7" cy="7" r="2.5" /><line x1="7" y1="1" x2="7" y2="2" /><line x1="7" y1="12" x2="7" y2="13" /><line x1="1" y1="7" x2="2" y2="7" /><line x1="12" y1="7" x2="13" y2="7" /><line x1="2.8" y1="2.8" x2="3.5" y2="3.5" /><line x1="10.5" y1="10.5" x2="11.2" y2="11.2" /><line x1="2.8" y1="11.2" x2="3.5" y2="10.5" /><line x1="10.5" y1="3.5" x2="11.2" y2="2.8" /></svg>
  ),
  moon: (p) => (
    <svg width={p?.size || 14} height={p?.size || 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M12 8A5 5 0 016 2a7 7 0 100 10 5 5 0 016-4z" /></svg>
  ),
  arrowRight: (p) => (
    <svg width={p?.size || 13} height={p?.size || 13} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="7" x2="11" y2="7" /><polyline points="7.5,3.5 11,7 7.5,10.5" /></svg>
  ),
  check: (p) => (
    <svg width={p?.size || 14} height={p?.size || 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5,7.5 5.5,10.5 11.5,3.5" /></svg>
  ),
  x: (p) => (
    <svg width={p?.size || 14} height={p?.size || 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="3.5" y1="3.5" x2="10.5" y2="10.5" /><line x1="10.5" y1="3.5" x2="3.5" y2="10.5" /></svg>
  ),
  slash: (p) => (
    <svg width={p?.size || 14} height={p?.size || 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="5.5" /><line x1="3.1" y1="3.1" x2="10.9" y2="10.9" /></svg>
  ),
  lock: (p) => (
    <svg width={p?.size || 14} height={p?.size || 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="9" height="6.5" rx="1.2" /><path d="M4.5 6V4.2a2.5 2.5 0 015 0V6" /></svg>
  ),
};
window.ICONS = ICONS;
