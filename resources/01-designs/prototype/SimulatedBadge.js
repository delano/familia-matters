/* prototype/SimulatedBadge.js — shared simulated/demo indicator. window.SimulatedBadge */
(function () {
  'use strict';

  var DS = window.FamiliaAdminDesignSystem_a9098d;
  var DSBadge = DS && DS.Badge;

  var DEMO_TITLE = 'Demo mode — serving seed data (FAMILIA_DEMO_MODE)';
  var OFFLINE_TITLE = 'Backend unreachable — serving from seed';

  function SimulatedBadge(props) {
    var demo = !!window.FAMILIA_DEMO_MODE;
    var tone = demo ? 'preview' : 'caution';
    var label = demo ? 'demo mode' : 'simulated';
    var defaultTitle = demo ? DEMO_TITLE : OFFLINE_TITLE;
    var title = props.title !== undefined ? props.title : defaultTitle;
    var style = props.style || null;

    var rest = {};
    var skip = { title: 1, style: 1, children: 1 };
    for (var k in props) {
      if (props.hasOwnProperty(k) && !skip[k]) rest[k] = props[k];
    }

    if (DSBadge) {
      return React.createElement(
        DSBadge,
        Object.assign({ tone: tone, uppercase: true, mono: true, title: title, style: style }, rest),
        label
      );
    }

    var statusVar = demo ? 'preview' : 'caution';
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
          background: 'var(--admin-status-' + statusVar + '-bg)',
          color: 'var(--admin-status-' + statusVar + ')',
          border: '1px solid transparent',
          whiteSpace: 'nowrap'
        }, style)
      }, rest),
      label
    );
  }

  window.SimulatedBadge = SimulatedBadge;
})();
