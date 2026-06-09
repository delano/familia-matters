/* prototype/SimulatedBadge.js — shared "simulated" indicator for offline state.
 *
 * Renders a caution-toned badge that signals seed/simulated data.  Uses the
 * design-system Badge when available (tone="caution", uppercase, mono);
 * falls back to a styled <span> with identical visual treatment.
 *
 * Exposed as:  window.SimulatedBadge
 *
 * Props
 * ─────────────────────────────────────────────────────────────────────────────
 *   title   {string}  Tooltip text.  Default: "Backend unreachable — serving from seed"
 *   style   {object}  Merge into the root element's inline styles.
 *   ...rest           Forwarded to the underlying element (data-*, aria-*, etc.).
 *
 * Usage (inside a text/babel JSX file):
 *   {offline && <SimulatedBadge />}
 *   {offline && <SimulatedBadge title="Custom tooltip" />}
 */
(function () {
  'use strict';

  var DS = window.FamiliaAdminDesignSystem_a9098d;
  var DSBadge = DS && DS.Badge;

  var DEFAULT_TITLE = 'Backend unreachable — serving from seed';

  function SimulatedBadge(props) {
    var title = props.title !== undefined ? props.title : DEFAULT_TITLE;
    var style = props.style || null;

    // Strip known props; forward everything else.
    var rest = {};
    var skip = { title: 1, style: 1, children: 1 };
    for (var k in props) {
      if (props.hasOwnProperty(k) && !skip[k]) rest[k] = props[k];
    }

    if (DSBadge) {
      return React.createElement(
        DSBadge,
        Object.assign({ tone: 'caution', uppercase: true, mono: true, title: title, style: style }, rest),
        'simulated'
      );
    }

    // Fallback: plain span matching the design-system Badge visual.
    return React.createElement(
      'span',
      Object.assign({
        title: title,
        style: Object.assign({
          display: 'inline-flex',
          alignItems: 'center',
          height: 18,
          padding: '0 6px',
          fontFamily: 'var(--admin-mono)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 'var(--admin-tracking-label, 0.06em)',
          textTransform: 'uppercase',
          borderRadius: 'var(--admin-radius-sm)',
          background: 'var(--admin-status-caution-bg)',
          color: 'var(--admin-status-caution)',
          border: '1px solid transparent',
          whiteSpace: 'nowrap'
        }, style)
      }, rest),
      'simulated'
    );
  }

  window.SimulatedBadge = SimulatedBadge;
})();
