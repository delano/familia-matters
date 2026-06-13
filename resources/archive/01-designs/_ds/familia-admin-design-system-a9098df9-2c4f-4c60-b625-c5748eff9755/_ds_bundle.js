/* @ds-bundle: {"format":3,"namespace":"FamiliaAdminDesignSystem_a9098d","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Kbd","sourcePath":"components/core/Kbd.jsx"},{"name":"Mono","sourcePath":"components/core/Mono.jsx"},{"name":"StatusDot","sourcePath":"components/core/StatusDot.jsx"},{"name":"CountPair","sourcePath":"components/data/CountPair.jsx"},{"name":"DataTable","sourcePath":"components/data/DataTable.jsx"},{"name":"FieldChip","sourcePath":"components/data/FieldChip.jsx"},{"name":"KeyValue","sourcePath":"components/data/KeyValue.jsx"},{"name":"Banner","sourcePath":"components/feedback/Banner.jsx"},{"name":"DryRunConfirm","sourcePath":"components/feedback/DryRunConfirm.jsx"},{"name":"ProgressStream","sourcePath":"components/feedback/ProgressStream.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Breadcrumb","sourcePath":"components/navigation/Breadcrumb.jsx"},{"name":"Sidebar","sourcePath":"components/navigation/Sidebar.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"Topbar","sourcePath":"components/navigation/Topbar.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"ed34fb90dd8c","components/core/Button.jsx":"e569b5b7abcf","components/core/IconButton.jsx":"1f968f0560d1","components/core/Kbd.jsx":"2b16d27a7538","components/core/Mono.jsx":"185c334a5366","components/core/StatusDot.jsx":"fa26017e70ca","components/data/CountPair.jsx":"829a88df1050","components/data/DataTable.jsx":"f98586cf6bef","components/data/FieldChip.jsx":"6534a4e9b75e","components/data/KeyValue.jsx":"c97205c15734","components/feedback/Banner.jsx":"0138dca5fd1c","components/feedback/DryRunConfirm.jsx":"ab95d4ecfaa1","components/feedback/ProgressStream.jsx":"183769a237e9","components/forms/Checkbox.jsx":"2bdad7892a9b","components/forms/Input.jsx":"aba468e1600b","components/forms/Select.jsx":"36da2c21ce1c","components/forms/Switch.jsx":"c05fc11eff01","components/navigation/Breadcrumb.jsx":"a1bdf3a06598","components/navigation/Sidebar.jsx":"62840678d1fa","components/navigation/Tabs.jsx":"06e2957e220e","components/navigation/Topbar.jsx":"768e717b05fd","ui_kits/familia_admin/AppShell.jsx":"7ba7fbd60e5f","ui_kits/familia_admin/IntegrityView.jsx":"b3f201eae2d1","ui_kits/familia_admin/MigrationsView.jsx":"08f97f704da3","ui_kits/familia_admin/ModelsView.jsx":"ac410601a3b7","ui_kits/familia_admin/RecordsView.jsx":"ca716ca0386b","ui_kits/familia_admin/components.jsx":"8344418342c2","ui_kits/familia_admin/data.js":"fcf2bd4e637b","ui_kits/familia_admin/icons.js":"ff26019049dd"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.FamiliaAdminDesignSystem_a9098d = window.FamiliaAdminDesignSystem_a9098d || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge — a compact tag of inline metadata.
 *
 * Tones: neutral (default), accent, healthy, caution, broken, preview.
 * Variants: solid (filled with -bg tint), outline (border only).
 */
function Badge({
  children,
  tone = 'neutral',
  variant = 'solid',
  mono = false,
  uppercase = false,
  style,
  ...rest
}) {
  const tones = {
    neutral: {
      solid: {
        bg: 'var(--admin-surface-sunken)',
        fg: 'var(--admin-text)',
        bd: 'var(--admin-border-color)'
      },
      outline: {
        bg: 'transparent',
        fg: 'var(--admin-text-muted)',
        bd: 'var(--admin-border-strong)'
      }
    },
    accent: {
      solid: {
        bg: 'rgba(232,121,249,0.16)',
        fg: 'var(--admin-accent)',
        bd: 'rgba(232,121,249,0.30)'
      },
      outline: {
        bg: 'transparent',
        fg: 'var(--admin-accent)',
        bd: 'var(--admin-accent)'
      }
    },
    healthy: {
      solid: {
        bg: 'var(--admin-status-healthy-bg)',
        fg: 'var(--admin-status-healthy)',
        bd: 'transparent'
      },
      outline: {
        bg: 'transparent',
        fg: 'var(--admin-status-healthy)',
        bd: 'var(--admin-status-healthy)'
      }
    },
    caution: {
      solid: {
        bg: 'var(--admin-status-caution-bg)',
        fg: 'var(--admin-status-caution)',
        bd: 'transparent'
      },
      outline: {
        bg: 'transparent',
        fg: 'var(--admin-status-caution)',
        bd: 'var(--admin-status-caution)'
      }
    },
    broken: {
      solid: {
        bg: 'var(--admin-status-broken-bg)',
        fg: 'var(--admin-status-broken)',
        bd: 'transparent'
      },
      outline: {
        bg: 'transparent',
        fg: 'var(--admin-status-broken)',
        bd: 'var(--admin-status-broken)'
      }
    },
    preview: {
      solid: {
        bg: 'var(--admin-status-preview-bg)',
        fg: 'var(--admin-status-preview)',
        bd: 'transparent'
      },
      outline: {
        bg: 'transparent',
        fg: 'var(--admin-status-preview)',
        bd: 'var(--admin-status-preview)'
      }
    }
  };
  const t = tones[tone]?.[variant] || tones.neutral.solid;
  return /*#__PURE__*/React.createElement("span", _extends({
    "data-tone": tone,
    "data-variant": variant,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      height: 18,
      padding: '0 6px',
      fontFamily: mono ? 'var(--admin-mono)' : 'var(--admin-font-family)',
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: uppercase ? 'var(--admin-tracking-label)' : 0.1,
      textTransform: uppercase ? 'uppercase' : 'none',
      borderRadius: 'var(--admin-radius-sm)',
      background: t.bg,
      color: t.fg,
      border: `1px solid ${t.bd}`,
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — the primary action primitive.
 *
 * Variants:
 *   primary   Otto pink. AT MOST one per view.
 *   secondary Bordered surface — the default for almost everything.
 *   ghost     No border. Used in toolbars where chrome would crowd.
 *   danger    Red. For destructive confirms (always paired with DryRunConfirm).
 *
 * Sizes: sm (24px), md (28px), lg (32px). Default md.
 */
function Button({
  children,
  variant = 'secondary',
  size = 'md',
  type = 'button',
  disabled = false,
  loading = false,
  iconLeft,
  iconRight,
  onClick,
  style,
  className = '',
  ...rest
}) {
  const h = {
    sm: 24,
    md: 28,
    lg: 32
  }[size] || 28;
  const fs = size === 'lg' ? 13 : 12;
  const px = size === 'sm' ? 8 : size === 'lg' ? 14 : 10;
  const variants = {
    primary: {
      background: 'var(--admin-accent)',
      color: 'var(--admin-accent-on)',
      border: '1px solid var(--admin-accent)',
      fontWeight: 600
    },
    secondary: {
      background: 'var(--admin-surface-raised)',
      color: 'var(--admin-text)',
      border: '1px solid var(--admin-border-strong)',
      fontWeight: 500
    },
    ghost: {
      background: 'transparent',
      color: 'var(--admin-text)',
      border: '1px solid transparent',
      fontWeight: 500
    },
    danger: {
      background: 'var(--admin-status-broken)',
      color: '#FFFFFF',
      border: '1px solid var(--admin-status-broken)',
      fontWeight: 600
    }
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled || loading,
    onClick: onClick,
    "data-variant": variant,
    "data-size": size,
    className: `admin-btn ${className}`,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: h,
      padding: `0 ${px}px`,
      fontFamily: 'var(--admin-font-family)',
      fontSize: fs,
      lineHeight: 1,
      letterSpacing: 0.1,
      borderRadius: 'var(--admin-radius-sm)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'background var(--admin-motion-fast) var(--admin-ease), border-color var(--admin-motion-fast) var(--admin-ease), color var(--admin-motion-fast) var(--admin-ease)',
      whiteSpace: 'nowrap',
      ...variants[variant],
      ...style
    }
  }, rest), loading ? /*#__PURE__*/React.createElement(Spinner, null) : iconLeft, /*#__PURE__*/React.createElement("span", null, children), iconRight);
}
function Spinner() {
  return /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    style: {
      animation: 'admin-spin 0.8s linear infinite'
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "6",
    r: "4.5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeOpacity: "0.25"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 1.5 A4.5 4.5 0 0 1 10.5 6",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IconButton — square icon-only button. Used in toolbars, table row actions,
 * and the topbar. Always has an aria-label.
 */
function IconButton({
  children,
  ariaLabel,
  size = 'md',
  variant = 'ghost',
  disabled = false,
  onClick,
  style,
  ...rest
}) {
  const dim = {
    sm: 22,
    md: 26,
    lg: 30
  }[size] || 26;
  const variants = {
    ghost: {
      background: 'transparent',
      border: '1px solid transparent',
      color: 'var(--admin-text-muted)'
    },
    bordered: {
      background: 'var(--admin-surface-raised)',
      border: '1px solid var(--admin-border-strong)',
      color: 'var(--admin-text)'
    }
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": ariaLabel,
    title: ariaLabel,
    disabled: disabled,
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: dim,
      height: dim,
      borderRadius: 'var(--admin-radius-sm)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      transition: 'background var(--admin-motion-fast) var(--admin-ease), color var(--admin-motion-fast) var(--admin-ease)',
      ...variants[variant],
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Kbd.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Kbd — a keyboard key. Used in tooltips and the "shortcuts" overlay.
 * Renders ⌘/⇧/⌥/↵ in mono with a subtle bezel.
 */
function Kbd({
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("kbd", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 18,
      height: 18,
      padding: '0 5px',
      fontFamily: 'var(--admin-mono)',
      fontSize: 11,
      fontWeight: 500,
      background: 'var(--admin-surface-sunken)',
      border: '1px solid var(--admin-border-color)',
      borderBottomWidth: 2,
      borderRadius: 4,
      color: 'var(--admin-text-muted)',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Kbd });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Kbd.jsx", error: String((e && e.message) || e) }); }

// components/core/Mono.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Mono — wraps any machine value in monospace. Convenience over a raw <code>.
 * Use for ids, keys, scores, digests, paths, commands, timestamps.
 */
function Mono({
  children,
  size = 'base',
  muted = false,
  style,
  ...rest
}) {
  const fs = {
    xs: 10,
    sm: 11,
    base: 12,
    md: 13
  }[size] || 12;
  return /*#__PURE__*/React.createElement("code", _extends({
    style: {
      fontFamily: 'var(--admin-mono)',
      fontSize: fs,
      fontFeatureSettings: '"liga" 0, "calt" 0',
      color: muted ? 'var(--admin-text-muted)' : 'inherit',
      background: 'transparent',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Mono });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Mono.jsx", error: String((e && e.message) || e) }); }

// components/core/StatusDot.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * StatusDot — the canonical status indicator.
 * A colored 8px dot that ALWAYS sits next to a label. Never color-only.
 *
 * Status maps:
 *   healthy  → success
 *   caution  → warning  (stale index, schema drift, approximate count)
 *   broken   → error    (phantom, missing, failed repair, mismatch)
 *   preview  → info     (dry-run, plan output, "logged" notices)
 *   neutral  → gray     (default state, no judgement)
 */
function StatusDot({
  status = 'neutral',
  size = 8,
  label,
  mono = false,
  style,
  ...rest
}) {
  const colorVar = {
    healthy: 'var(--admin-status-healthy)',
    caution: 'var(--admin-status-caution)',
    broken: 'var(--admin-status-broken)',
    preview: 'var(--admin-status-preview)',
    neutral: 'var(--admin-status-neutral)'
  }[status] || 'var(--admin-status-neutral)';
  if (!label) {
    return /*#__PURE__*/React.createElement("span", _extends({
      "aria-label": status,
      role: "img",
      style: {
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 9999,
        background: colorVar,
        flex: 'none',
        ...style
      }
    }, rest));
  }
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: size,
      height: size,
      borderRadius: 9999,
      background: colorVar,
      flex: 'none'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: mono ? 'var(--admin-mono)' : 'inherit',
      fontSize: 12,
      color: 'var(--admin-text)'
    }
  }, label));
}
Object.assign(__ds_scope, { StatusDot });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatusDot.jsx", error: String((e && e.message) || e) }); }

// components/data/CountPair.jsx
try { (() => {
/**
 * CountPair — dual count display: fast (timeline) vs exact (SCAN).
 * When the two disagree, the row is rendered with a caution tint.
 *
 * The "count_fast may include phantoms" rule from descriptor.rb shows up
 * everywhere in the admin; this component is the canonical render.
 */
function CountPair({
  fast,
  exact,
  fastLabel = 'timeline',
  exactLabel = 'scan',
  style
}) {
  const disagree = exact != null && fast != null && fast !== exact;
  const dim = n => n == null ? '—' : n.toLocaleString();
  return /*#__PURE__*/React.createElement("span", {
    "data-disagree": disagree || undefined,
    style: {
      display: 'inline-flex',
      alignItems: 'baseline',
      gap: 8,
      fontFamily: 'var(--admin-mono)',
      fontSize: 12,
      color: disagree ? 'var(--admin-status-caution)' : 'var(--admin-text)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    title: fastLabel
  }, "\u2248 ", dim(fast)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--admin-text-subtle)',
      fontSize: 11
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    title: exactLabel,
    style: {
      color: disagree ? 'var(--admin-status-caution)' : 'var(--admin-text-muted)'
    }
  }, dim(exact), " ", exactLabel));
}
Object.assign(__ds_scope, { CountPair });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/CountPair.jsx", error: String((e && e.message) || e) }); }

// components/data/DataTable.jsx
try { (() => {
/**
 * DataTable — the workhorse of the admin. Dense rows (32 px), no vertical
 * column rules, horizontal hairlines only, optional row hover, optional
 * selectable rows with a checkbox column.
 *
 * Columns spec:
 *   { key, header, width?, align?, mono?, render?(value, row) }
 *
 * Right-align numeric/score columns. Mono everything machine. Use a
 * StatusDot in the first content column for state.
 */
function DataTable({
  columns,
  rows,
  rowKey = r => r.id || r.key || r.custid,
  selectable = false,
  selected = [],
  onSelectChange,
  emptyMessage = 'No rows.',
  style
}) {
  const allSelected = selectable && rows.length > 0 && selected.length === rows.length;
  const toggle = k => {
    if (!onSelectChange) return;
    onSelectChange(selected.includes(k) ? selected.filter(x => x !== k) : [...selected, k]);
  };
  const toggleAll = () => {
    if (!onSelectChange) return;
    onSelectChange(allSelected ? [] : rows.map(rowKey));
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--admin-surface)',
      border: 'var(--admin-border)',
      borderRadius: 'var(--admin-radius)',
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 'var(--admin-font-size-base)'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: 'var(--admin-surface-sunken)'
    }
  }, selectable && /*#__PURE__*/React.createElement("th", {
    style: thStyle({
      width: 28,
      align: 'center'
    })
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: allSelected,
    onChange: toggleAll,
    style: {
      accentColor: 'var(--admin-accent)'
    },
    "aria-label": "Select all rows"
  })), columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    style: thStyle(c)
  }, c.header)))), /*#__PURE__*/React.createElement("tbody", null, rows.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: columns.length + (selectable ? 1 : 0),
    style: {
      height: 64,
      textAlign: 'center',
      color: 'var(--admin-text-muted)',
      fontSize: 12
    }
  }, emptyMessage)), rows.map((row, i) => {
    const k = rowKey(row);
    const isSelected = selectable && selected.includes(k);
    return /*#__PURE__*/React.createElement("tr", {
      key: k ?? i,
      "data-selected": isSelected || undefined,
      style: {
        height: 'var(--admin-row-height)',
        borderTop: '1px solid var(--admin-border-color)',
        background: isSelected ? 'var(--admin-selection-bg)' : 'transparent',
        transition: 'background var(--admin-motion-fast) var(--admin-ease)'
      }
    }, selectable && /*#__PURE__*/React.createElement("td", {
      style: tdStyle({
        align: 'center',
        width: 28
      })
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: isSelected,
      onChange: () => toggle(k),
      style: {
        accentColor: 'var(--admin-accent)'
      },
      "aria-label": `Select row ${k}`
    })), columns.map(c => {
      const v = row[c.key];
      const content = c.render ? c.render(v, row) : v;
      return /*#__PURE__*/React.createElement("td", {
        key: c.key,
        style: tdStyle(c)
      }, c.mono ? /*#__PURE__*/React.createElement("code", {
        style: {
          fontFamily: 'var(--admin-mono)',
          fontSize: 12
        }
      }, content) : content);
    }));
  }))));
}
function thStyle(c) {
  return {
    height: 28,
    padding: '0 12px',
    textAlign: c.align || 'left',
    width: c.width,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 'var(--admin-tracking-eyebrow)',
    textTransform: 'uppercase',
    color: 'var(--admin-text-muted)',
    borderBottom: '1px solid var(--admin-border-color)',
    whiteSpace: 'nowrap'
  };
}
function tdStyle(c) {
  return {
    padding: '0 12px',
    textAlign: c.align || 'left',
    width: c.width,
    fontSize: 'var(--admin-font-size-base)',
    color: 'var(--admin-text)',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap'
  };
}
Object.assign(__ds_scope, { DataTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/DataTable.jsx", error: String((e && e.message) || e) }); }

// components/data/FieldChip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * FieldChip — labels a Familia field by category:
 *   identifier  the model's identifier_field
 *   encrypted   value is concealed; revealable behind audit
 *   transient   never persisted; redacted from API responses
 *   plain       normal persisted field (rarely shown explicitly)
 */
function FieldChip({
  category,
  style,
  ...rest
}) {
  const map = {
    identifier: {
      label: 'ID',
      bg: 'rgba(168,85,247,0.16)',
      color: 'var(--admin-field-identifier)',
      border: 'transparent',
      borderStyle: 'solid'
    },
    encrypted: {
      label: '[CONCEALED]',
      bg: 'var(--admin-surface-sunken)',
      color: 'var(--admin-field-encrypted)',
      border: 'var(--admin-border-color)',
      borderStyle: 'solid'
    },
    transient: {
      label: '[REDACTED]',
      bg: 'transparent',
      color: 'var(--admin-field-transient)',
      border: 'var(--admin-border-strong)',
      borderStyle: 'dashed'
    },
    plain: {
      label: 'field',
      bg: 'transparent',
      color: 'var(--admin-text-muted)',
      border: 'var(--admin-border-color)',
      borderStyle: 'solid'
    }
  };
  const t = map[category] || map.plain;
  return /*#__PURE__*/React.createElement("span", _extends({
    "data-category": category,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      height: 18,
      padding: '0 7px',
      fontFamily: 'var(--admin-mono)',
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: 0.2,
      borderRadius: 9999,
      background: t.bg,
      color: t.color,
      border: `1px ${t.borderStyle} ${t.border}`,
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), t.label);
}
Object.assign(__ds_scope, { FieldChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/FieldChip.jsx", error: String((e && e.message) || e) }); }

// components/data/KeyValue.jsx
try { (() => {
/**
 * KeyValue — labeled value row. The eyebrow above the value pattern.
 * In a vertical stack for a sidebar, or a single row in detail headers.
 */
function KeyValue({
  label,
  value,
  mono = false,
  layout = 'stack',
  style
}) {
  const isRow = layout === 'row';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: isRow ? 'grid' : 'flex',
      gridTemplateColumns: isRow ? '120px 1fr' : undefined,
      flexDirection: isRow ? undefined : 'column',
      gap: isRow ? 12 : 4,
      alignItems: isRow ? 'baseline' : 'stretch',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: 'var(--admin-tracking-eyebrow)',
      textTransform: 'uppercase',
      color: 'var(--admin-text-muted)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: mono ? 'var(--admin-mono)' : 'inherit',
      fontSize: 13,
      color: 'var(--admin-text)',
      wordBreak: 'break-all'
    }
  }, value));
}
Object.assign(__ds_scope, { KeyValue });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/KeyValue.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Banner.jsx
try { (() => {
/**
 * Banner — page-level status callout. Tinted background, status dot, text,
 * optional action(s). Used for "stale indexes detected" or "schema drift".
 */
function Banner({
  tone = 'preview',
  title,
  children,
  actions,
  style
}) {
  const colors = {
    healthy: 'var(--admin-status-healthy)',
    caution: 'var(--admin-status-caution)',
    broken: 'var(--admin-status-broken)',
    preview: 'var(--admin-status-preview)',
    neutral: 'var(--admin-status-neutral)'
  };
  const bgs = {
    healthy: 'var(--admin-status-healthy-bg)',
    caution: 'var(--admin-status-caution-bg)',
    broken: 'var(--admin-status-broken-bg)',
    preview: 'var(--admin-status-preview-bg)',
    neutral: 'var(--admin-surface-sunken)'
  };
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    "data-tone": tone,
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '10px 14px',
      background: bgs[tone],
      border: `1px solid ${colors[tone]}40`,
      borderLeft: `3px solid ${colors[tone]}`,
      borderRadius: 'var(--admin-radius-sm)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 9999,
      background: colors[tone],
      marginTop: 6,
      flex: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--admin-text)'
    }
  }, title), children && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--admin-text-muted)',
      marginTop: title ? 2 : 0
    }
  }, children)), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, actions));
}
Object.assign(__ds_scope, { Banner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Banner.jsx", error: String((e && e.message) || e) }); }

// components/feedback/DryRunConfirm.jsx
try { (() => {
/**
 * DryRunConfirm — the signature primitive of Familia Admin.
 *
 * Every destructive action (repair, migrate, destroy, reveal) flows through
 * the same three steps:
 *
 *   1. dry-run     show the plan / impact without touching data
 *   2. confirm     surface the impact again, require an ack checkbox
 *   3. apply       run the operation, hand off to ProgressStream
 *
 * Render this inline (panel) or as a dialog. The component owns the step
 * state; consumers wire `onApply` and read `step` if they need to render
 * progress externally.
 */
function DryRunConfirm({
  title,
  description,
  impact,
  // array of { label, value, tone? }
  ackLabel = 'I understand this is permanent.',
  applyLabel = 'Apply',
  dryRunLabel = 'Run dry-run',
  onDryRun,
  // optional async — returns plan
  onApply,
  // async — actually apply
  variant = 'panel',
  // 'panel' | 'dialog'
  initialStep = 'idle',
  // 'idle' | 'preview' | 'confirm' | 'applying' | 'done'
  children,
  // optional extra content for the preview step
  style
}) {
  const [step, setStep] = React.useState(initialStep);
  const [ack, setAck] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const runDry = async () => {
    setBusy(true);
    try {
      if (onDryRun) await onDryRun();
    } finally {
      setBusy(false);
      setStep('preview');
    }
  };
  const startConfirm = () => setStep('confirm');
  const apply = async () => {
    setBusy(true);
    setStep('applying');
    try {
      if (onApply) await onApply();
      setStep('done');
    } finally {
      setBusy(false);
    }
  };
  const reset = () => {
    setStep('idle');
    setAck(false);
  };
  const wrap = inner => variant === 'dialog' ? /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(2px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 560,
      maxWidth: 'calc(100% - 32px)',
      background: 'var(--admin-surface-raised)',
      border: '1px solid var(--admin-border-color)',
      borderRadius: 'var(--admin-radius-lg)',
      boxShadow: 'var(--otto-shadow-lg)',
      overflow: 'hidden'
    }
  }, inner)) : /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--admin-surface)',
      border: 'var(--admin-border)',
      borderRadius: 'var(--admin-radius)',
      overflow: 'hidden',
      ...style
    }
  }, inner);
  const StepRail = () => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 10,
      fontFamily: 'var(--admin-mono)',
      color: 'var(--admin-text-muted)'
    }
  }, ['idle', 'preview', 'confirm', 'applying', 'done'].slice(0, 4).map((s, i) => {
    const order = ['idle', 'preview', 'confirm', 'applying'];
    const active = order.indexOf(step === 'done' ? 'applying' : step) >= order.indexOf(s);
    const label = ['dry-run', 'preview', 'confirm', 'apply'][i];
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: s
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color: active ? 'var(--admin-text)' : 'var(--admin-text-subtle)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: 9999,
        background: active ? 'var(--admin-accent)' : 'var(--admin-border-strong)'
      }
    }), label), i < 3 && /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--admin-text-subtle)'
      }
    }, "\u2192"));
  }));
  return wrap(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 16px',
      borderBottom: '1px solid var(--admin-border-color)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--admin-text)'
    }
  }, title), description && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--admin-text-muted)',
      marginTop: 2
    }
  }, description)), /*#__PURE__*/React.createElement(StepRail, null)), step === 'idle' && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--admin-text-muted)'
    }
  }, "Start with a ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--admin-text)'
    }
  }, "dry-run"), ". Nothing will be written until you confirm."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: runDry,
    disabled: busy,
    style: btn('primary')
  }, dryRunLabel))), (step === 'preview' || step === 'confirm') && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16,
      display: 'grid',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: 'var(--admin-status-preview-bg)',
      border: '1px solid var(--admin-status-preview)40',
      borderLeft: '3px solid var(--admin-status-preview)',
      borderRadius: 'var(--admin-radius-sm)',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 9999,
      background: 'var(--admin-status-preview)'
    }
  }), /*#__PURE__*/React.createElement("span", null, "Dry-run results \u2014 nothing has been applied.")), impact && /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid var(--admin-border-color)',
      borderRadius: 'var(--admin-radius-sm)',
      overflow: 'hidden'
    }
  }, impact.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      alignItems: 'center',
      padding: '6px 12px',
      borderTop: i ? '1px solid var(--admin-border-color)' : 'none',
      background: 'var(--admin-bg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, it.tone && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 9999,
      background: `var(--admin-status-${it.tone})`
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12
    }
  }, it.label)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--admin-mono)',
      fontSize: 12,
      color: 'var(--admin-text)'
    }
  }, it.value)))), children, step === 'confirm' && /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      border: '1px solid var(--admin-status-broken)',
      background: 'var(--admin-status-broken-bg)',
      borderRadius: 'var(--admin-radius-sm)',
      cursor: 'pointer',
      fontSize: 12,
      color: 'var(--admin-text)'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: ack,
    onChange: e => setAck(e.target.checked),
    style: {
      accentColor: 'var(--admin-status-broken)'
    }
  }), ackLabel), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      justifyContent: 'flex-end',
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: reset,
    style: btn('secondary'),
    disabled: busy
  }, "Cancel"), step === 'preview' ? /*#__PURE__*/React.createElement("button", {
    onClick: startConfirm,
    style: btn('primary'),
    disabled: busy
  }, "Continue") : /*#__PURE__*/React.createElement("button", {
    onClick: apply,
    style: btn('danger', !ack),
    disabled: !ack || busy
  }, applyLabel))), step === 'applying' && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16,
      display: 'grid',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--admin-text-muted)'
    }
  }, "Applying\u2026"), children), step === 'done' && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16,
      display: 'grid',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: 'var(--admin-status-healthy-bg)',
      border: '1px solid var(--admin-status-healthy)40',
      borderLeft: '3px solid var(--admin-status-healthy)',
      borderRadius: 'var(--admin-radius-sm)',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 9999,
      background: 'var(--admin-status-healthy)'
    }
  }), /*#__PURE__*/React.createElement("span", null, "Applied.")), children, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: reset,
    style: btn('secondary')
  }, "Close")))));
}
function btn(variant, mute = false) {
  const base = {
    height: 28,
    padding: '0 12px',
    fontFamily: 'var(--admin-font-family)',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 'var(--admin-radius-sm)',
    cursor: mute ? 'not-allowed' : 'pointer',
    opacity: mute ? 0.5 : 1,
    border: '1px solid transparent',
    transition: 'background var(--admin-motion-fast) var(--admin-ease)'
  };
  if (variant === 'primary') return {
    ...base,
    background: 'var(--admin-accent)',
    color: 'var(--admin-accent-on)'
  };
  if (variant === 'danger') return {
    ...base,
    background: 'var(--admin-status-broken)',
    color: '#FFFFFF'
  };
  return {
    ...base,
    background: 'var(--admin-surface-raised)',
    color: 'var(--admin-text)',
    borderColor: 'var(--admin-border-strong)'
  };
}
Object.assign(__ds_scope, { DryRunConfirm });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/DryRunConfirm.jsx", error: String((e && e.message) || e) }); }

// components/feedback/ProgressStream.jsx
try { (() => {
/**
 * ProgressStream — phase-by-phase progress for long-running operations
 * (repair, migration, drift scan). Driven by JSONL events of the shape
 *
 *   { event: 'start', model, dry_run, at }
 *   { phase: 'instances', current, total, result? }
 *   { event: 'done', healthy, at, summary }
 *
 * Renders one row per phase with its progress bar and final result.
 * Phases are listed in the order they first appear in `events`.
 */
function ProgressStream({
  events = [],
  style
}) {
  // Group events by phase, preserving first-seen order.
  const phaseOrder = [];
  const phaseMap = {};
  let start = null;
  let done = null;
  for (const e of events) {
    if (e.event === 'start') start = e;else if (e.event === 'done') done = e;else if (e.phase) {
      if (!(e.phase in phaseMap)) {
        phaseOrder.push(e.phase);
        phaseMap[e.phase] = {
          events: []
        };
      }
      phaseMap[e.phase].events.push(e);
    }
  }
  const phases = phaseOrder.map(name => {
    const evs = phaseMap[name].events;
    const last = evs[evs.length - 1];
    const complete = last.current === last.total;
    return {
      name,
      current: last.current,
      total: last.total,
      result: last.result,
      complete
    };
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: 'var(--admin-border)',
      borderRadius: 'var(--admin-radius)',
      background: 'var(--admin-surface)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 14px',
      borderBottom: '1px solid var(--admin-border-color)',
      fontSize: 11,
      color: 'var(--admin-text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 9999,
      background: done ? done.healthy ? 'var(--admin-status-healthy)' : 'var(--admin-status-broken)' : 'var(--admin-status-preview)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--admin-mono)',
      color: 'var(--admin-text)'
    }
  }, start?.dry_run ? 'dry-run · ' : 'apply · ', start?.model || '—'), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontFamily: 'var(--admin-mono)'
    }
  }, done ? `done · ${done.at - start?.at}s` : start ? 'streaming…' : 'pending')), /*#__PURE__*/React.createElement("div", null, phases.map((p, i) => /*#__PURE__*/React.createElement(PhaseRow, {
    key: p.name,
    phase: p,
    first: i === 0
  })), phases.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 14,
      fontSize: 12,
      color: 'var(--admin-text-muted)'
    }
  }, "Waiting for first event\u2026")), done && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 14px',
      borderTop: '1px solid var(--admin-border-color)',
      fontSize: 12,
      color: 'var(--admin-text)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      color: done.healthy ? 'var(--admin-status-healthy)' : 'var(--admin-status-broken)'
    }
  }, done.healthy ? 'Healthy.' : 'Issues remain.'), done.summary && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 8,
      color: 'var(--admin-text-muted)',
      fontFamily: 'var(--admin-mono)',
      fontSize: 11
    }
  }, Object.entries(done.summary).map(([k, v]) => `${k}=${v}`).join('  '))));
}
function PhaseRow({
  phase,
  first
}) {
  const pct = phase.total ? Math.round(phase.current / phase.total * 100) : 0;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '160px 1fr 80px',
      gap: 12,
      alignItems: 'center',
      padding: '6px 14px',
      borderTop: first ? 'none' : '1px solid var(--admin-border-color)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 9999,
      background: phase.complete ? 'var(--admin-status-healthy)' : 'var(--admin-status-preview)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--admin-mono)',
      fontSize: 11
    }
  }, phase.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 4,
      background: 'var(--admin-surface-sunken)',
      borderRadius: 9999,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${pct}%`,
      height: '100%',
      background: phase.complete ? 'var(--admin-status-healthy)' : 'var(--admin-accent)',
      transition: 'width var(--admin-motion-base) var(--admin-ease)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--admin-mono)',
      fontSize: 11,
      color: 'var(--admin-text-muted)',
      textAlign: 'right'
    }
  }, phase.current?.toLocaleString(), "/", phase.total?.toLocaleString()));
}
Object.assign(__ds_scope, { ProgressStream });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/ProgressStream.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
/**
 * Checkbox — native checkbox with admin chrome.
 */
function Checkbox({
  checked = false,
  onChange,
  disabled = false,
  label,
  indeterminate = false,
  style
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    ref: ref,
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked),
    style: {
      accentColor: 'var(--admin-accent)',
      width: 14,
      height: 14
    }
  }), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--admin-text)'
    }
  }, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Input — the text input primitive.
 *
 * Density-tuned: 28 px tall by default, 24 px sm, 32 px lg. Uses mono when
 * the input value is a machine value (keys, ids, queries).
 */
function Input({
  size = 'md',
  mono = false,
  invalid = false,
  prefix,
  suffix,
  style,
  inputStyle,
  ...rest
}) {
  const h = {
    sm: 24,
    md: 28,
    lg: 32
  }[size] || 28;
  return /*#__PURE__*/React.createElement("div", {
    "data-invalid": invalid || undefined,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      height: h,
      background: 'var(--admin-bg)',
      border: `1px solid ${invalid ? 'var(--admin-status-broken)' : 'var(--admin-border-strong)'}`,
      borderRadius: 'var(--admin-radius-sm)',
      paddingLeft: prefix ? 8 : 0,
      paddingRight: suffix ? 8 : 0,
      transition: 'border-color var(--admin-motion-fast) var(--admin-ease)',
      ...style
    }
  }, prefix && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--admin-text-muted)',
      fontFamily: mono ? 'var(--admin-mono)' : 'inherit',
      fontSize: 12,
      paddingRight: 6,
      borderRight: '1px solid var(--admin-border-color)',
      marginRight: 6,
      height: '100%',
      display: 'inline-flex',
      alignItems: 'center'
    }
  }, prefix), /*#__PURE__*/React.createElement("input", _extends({
    style: {
      flex: 1,
      height: '100%',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      padding: '0 8px',
      fontFamily: mono ? 'var(--admin-mono)' : 'inherit',
      fontSize: size === 'lg' ? 13 : 12,
      color: 'var(--admin-text)',
      ...inputStyle
    }
  }, rest)), suffix && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--admin-text-muted)',
      fontSize: 12,
      paddingLeft: 6,
      marginLeft: 6,
      borderLeft: '1px solid var(--admin-border-color)',
      height: '100%',
      display: 'inline-flex',
      alignItems: 'center'
    }
  }, suffix));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Select — dropdown wrapped on a native <select> for keyboard support.
 */
function Select({
  size = 'md',
  options = [],
  mono = false,
  style,
  ...rest
}) {
  const h = {
    sm: 24,
    md: 28,
    lg: 32
  }[size] || 28;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'inline-block',
      height: h,
      ...style
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    style: {
      appearance: 'none',
      height: h,
      padding: '0 26px 0 8px',
      background: 'var(--admin-bg)',
      color: 'var(--admin-text)',
      border: '1px solid var(--admin-border-strong)',
      borderRadius: 'var(--admin-radius-sm)',
      fontFamily: mono ? 'var(--admin-mono)' : 'inherit',
      fontSize: size === 'lg' ? 13 : 12
    }
  }, rest), options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label || o.value))), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 12 12",
    width: "10",
    height: "10",
    style: {
      position: 'absolute',
      right: 8,
      top: '50%',
      transform: 'translateY(-50%)',
      pointerEvents: 'none',
      color: 'var(--admin-text-muted)'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 5 L6 8 L9 5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Switch — binary toggle for theme, dry-run, masked-fields, etc.
 * Otto pink when on; gray-700 when off.
 */
function Switch({
  checked = false,
  onChange,
  disabled = false,
  label,
  style,
  ...rest
}) {
  const toggle = () => !disabled && onChange && onChange(!checked);
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", _extends({
    role: "switch",
    type: "button",
    "aria-checked": checked,
    onClick: toggle,
    disabled: disabled,
    style: {
      width: 28,
      height: 16,
      border: 'none',
      padding: 0,
      background: checked ? 'var(--admin-accent)' : 'var(--admin-border-strong)',
      borderRadius: 9999,
      position: 'relative',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'background var(--admin-motion-fast) var(--admin-ease)'
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      width: 12,
      height: 12,
      background: '#FFFFFF',
      borderRadius: 9999,
      position: 'absolute',
      top: 2,
      left: checked ? 14 : 2,
      transition: 'left var(--admin-motion-fast) var(--admin-ease)',
      boxShadow: '0 1px 2px rgba(0,0,0,0.25)'
    }
  })), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--admin-text)'
    }
  }, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Breadcrumb.jsx
try { (() => {
/**
 * Breadcrumb — trail of links above a detail view.
 * Final item is the current page (not a link).
 */
function Breadcrumb({
  items = [],
  separator = '/',
  style
}) {
  return /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Breadcrumb",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      ...style
    }
  }, items.map((item, i) => {
    const last = i === items.length - 1;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: i
    }, i > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        margin: '0 6px',
        color: 'var(--admin-text-subtle)',
        fontFamily: 'var(--admin-mono)',
        fontSize: 12
      }
    }, separator), last ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: item.mono ? 'var(--admin-mono)' : 'inherit',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--admin-text)'
      }
    }, item.label) : /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: item.onClick,
      style: {
        fontFamily: item.mono ? 'var(--admin-mono)' : 'inherit',
        fontSize: 12,
        color: 'var(--admin-text-muted)',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: item.onClick ? 'pointer' : 'default'
      }
    }, item.label));
  }));
}
Object.assign(__ds_scope, { Breadcrumb });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Breadcrumb.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Sidebar.jsx
try { (() => {
/**
 * Sidebar — the fixed left navigation (232 px wide).
 * Items have an icon slot, a label, and an optional badge/count.
 * Active item gets an Otto pink left accent rule.
 */
function Sidebar({
  logo,
  items = [],
  footer,
  activeId,
  onNavigate,
  style
}) {
  return /*#__PURE__*/React.createElement("nav", {
    role: "navigation",
    "aria-label": "Main navigation",
    style: {
      width: 'var(--admin-sidebar-w)',
      height: '100%',
      background: 'var(--admin-surface)',
      borderRight: 'var(--admin-border)',
      display: 'flex',
      flexDirection: 'column',
      flex: 'none',
      ...style
    }
  }, logo && /*#__PURE__*/React.createElement("div", {
    style: {
      height: 'var(--admin-topbar-h)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 14px',
      borderBottom: '1px solid var(--admin-border-color)',
      flex: 'none'
    }
  }, logo), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: '8px 0'
    }
  }, items.map(item => {
    if (item.type === 'divider') {
      return /*#__PURE__*/React.createElement("div", {
        key: item.id || Math.random(),
        style: {
          height: 1,
          background: 'var(--admin-border-color)',
          margin: '6px 10px'
        }
      });
    }
    if (item.type === 'group') {
      return /*#__PURE__*/React.createElement("div", {
        key: item.id || item.label,
        style: {
          padding: '12px 14px 4px',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 'var(--admin-tracking-eyebrow)',
          textTransform: 'uppercase',
          color: 'var(--admin-text-subtle)'
        }
      }, item.label);
    }
    const active = item.id === activeId;
    return /*#__PURE__*/React.createElement("button", {
      key: item.id,
      type: "button",
      "aria-current": active ? 'page' : undefined,
      onClick: () => onNavigate && onNavigate(item.id),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        height: 32,
        padding: '0 14px 0 12px',
        border: 'none',
        borderLeft: `3px solid ${active ? 'var(--admin-accent)' : 'transparent'}`,
        background: active ? 'var(--admin-selection-bg)' : 'transparent',
        color: active ? 'var(--admin-text)' : 'var(--admin-text-muted)',
        fontFamily: 'var(--admin-font-family)',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background var(--admin-motion-fast) var(--admin-ease), color var(--admin-motion-fast) var(--admin-ease)'
      }
    }, item.icon && /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        alignItems: 'center',
        width: 16,
        flex: 'none',
        color: active ? 'var(--admin-accent)' : 'var(--admin-text-subtle)'
      }
    }, item.icon), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }
    }, item.label), item.badge != null && /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--admin-mono)',
        fontSize: 10,
        color: 'var(--admin-text-muted)',
        background: 'var(--admin-surface-sunken)',
        border: '1px solid var(--admin-border-color)',
        borderRadius: 9999,
        padding: '1px 6px'
      }
    }, item.badge));
  })), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid var(--admin-border-color)',
      padding: 8
    }
  }, footer));
}
Object.assign(__ds_scope, { Sidebar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Sidebar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
/**
 * Tabs — inline tab bar for switching between sub-views within a page.
 * E.g.: Fields | DataTypes | Indexes | Participations on a model detail.
 */
function Tabs({
  tabs = [],
  activeId,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    style: {
      display: 'flex',
      gap: 0,
      borderBottom: '1px solid var(--admin-border-color)',
      ...style
    }
  }, tabs.map(tab => {
    const active = tab.id === activeId;
    return /*#__PURE__*/React.createElement("button", {
      key: tab.id,
      role: "tab",
      "aria-selected": active,
      type: "button",
      onClick: () => onChange && onChange(tab.id),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: 36,
        padding: '0 14px',
        border: 'none',
        borderBottom: `2px solid ${active ? 'var(--admin-accent)' : 'transparent'}`,
        background: 'transparent',
        color: active ? 'var(--admin-text)' : 'var(--admin-text-muted)',
        fontFamily: 'var(--admin-font-family)',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        transition: 'color var(--admin-motion-fast) var(--admin-ease), border-color var(--admin-motion-fast) var(--admin-ease)',
        whiteSpace: 'nowrap'
      }
    }, tab.icon && /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        alignItems: 'center'
      }
    }, tab.icon), tab.label, tab.count != null && /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--admin-mono)',
        fontSize: 10,
        color: active ? 'var(--admin-text-muted)' : 'var(--admin-text-subtle)',
        background: 'var(--admin-surface-sunken)',
        borderRadius: 9999,
        padding: '1px 5px',
        border: '1px solid var(--admin-border-color)'
      }
    }, tab.count));
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Topbar.jsx
try { (() => {
/**
 * Topbar — 48 px fixed top bar.
 * Holds the breadcrumb trail (left), a search / command slot (center),
 * and utility controls (right).
 */
function Topbar({
  breadcrumb,
  actions,
  center,
  style
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      height: 'var(--admin-topbar-h)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '0 16px',
      background: 'var(--admin-surface)',
      borderBottom: 'var(--admin-border)',
      flex: 'none',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      alignItems: 'center'
    }
  }, breadcrumb), center && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      justifyContent: 'center'
    }
  }, center), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      flex: 'none'
    }
  }, actions));
}
Object.assign(__ds_scope, { Topbar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Topbar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/familia_admin/AppShell.jsx
try { (() => {
/* AppShell — the outer chrome: fixed sidebar + topbar + scrollable content.
 * Exports: AppShell, WordmarkLogo to window. */
const {
  Sidebar,
  Topbar,
  Breadcrumb,
  Badge,
  IconButton
} = window.FamiliaAdminDesignSystem_a9098d;
const {
  Icons
} = window;
function WordmarkLogo() {
  return React.createElement('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontWeight: 600,
      fontSize: 14,
      color: 'var(--admin-text)'
    }
  }, React.createElement('svg', {
    width: 20,
    height: 20,
    viewBox: '0 0 32 32',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'square'
  }, React.createElement('path', {
    d: 'M6 4L4 4L4 28L6 28'
  }), React.createElement('path', {
    d: 'M26 4L28 4L28 28L26 28'
  }), React.createElement('path', {
    d: 'M10 9L10 23'
  }), React.createElement('path', {
    d: 'M22 9L22 23'
  }), React.createElement('circle', {
    cx: 16,
    cy: 16,
    r: 2.25,
    fill: '#E879F9',
    stroke: 'none'
  })), React.createElement('span', null, 'familia', React.createElement('span', {
    style: {
      color: 'var(--admin-accent)'
    }
  }, '/'), 'admin'));
}
function AppShell({
  page,
  onNavigate,
  breadcrumb,
  children,
  dark,
  onToggleDark
}) {
  const navItems = [{
    id: 'models',
    type: 'item',
    label: 'Models',
    icon: React.createElement(Icons.table, null),
    badge: 3
  }, {
    id: 'integrity',
    type: 'item',
    label: 'Integrity',
    icon: React.createElement(Icons.shield, null),
    badge: '9'
  }, {
    type: 'divider'
  }, {
    type: 'group',
    label: 'System'
  }, {
    id: 'migrations',
    type: 'item',
    label: 'Migrations',
    icon: React.createElement(Icons.layers, null),
    badge: '2 pending'
  }, {
    id: 'raw',
    type: 'item',
    label: 'Raw explorer',
    icon: React.createElement(Icons.terminal, null)
  }];
  const actions = React.createElement('div', {
    style: {
      display: 'flex',
      gap: 4,
      alignItems: 'center'
    }
  }, React.createElement(IconButton, {
    ariaLabel: dark ? 'Light mode' : 'Dark mode',
    onClick: onToggleDark
  }, dark ? React.createElement(Icons.sun, null) : React.createElement(Icons.moon, null)), React.createElement('span', {
    style: {
      fontFamily: 'var(--admin-mono)',
      fontSize: 11,
      color: 'var(--admin-text-muted)',
      marginLeft: 4
    }
  }, 'v2.10.1'), React.createElement(Badge, {
    tone: 'accent',
    style: {
      marginLeft: 4
    }
  }, 'Familia'));
  return React.createElement('div', {
    style: {
      display: 'flex',
      height: '100vh',
      background: 'var(--admin-bg)',
      overflow: 'hidden'
    }
  }, React.createElement(Sidebar, {
    logo: React.createElement(WordmarkLogo),
    items: navItems,
    activeId: page,
    onNavigate,
    style: {
      flex: 'none'
    }
  }), React.createElement('div', {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      overflow: 'hidden'
    }
  }, React.createElement(Topbar, {
    breadcrumb: breadcrumb,
    actions: actions
  }), React.createElement('main', {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: 0
    }
  }, children)));
}
Object.assign(window, {
  AppShell,
  WordmarkLogo
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/familia_admin/AppShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/familia_admin/IntegrityView.jsx
try { (() => {
/* IntegrityView — health check report + DryRunConfirm repair flow + ProgressStream.
 * Exports: IntegrityView to window. */
const {
  Button,
  StatusDot,
  Badge,
  Banner,
  DataTable,
  DryRunConfirm,
  ProgressStream,
  Mono,
  Select,
  KeyValue,
  CountPair
} = window.FamiliaAdminDesignSystem_a9098d;
const {
  ADMIN_DATA: ID,
  Icons: II
} = window;
function IntegrityView() {
  const [model, setModel] = React.useState('Customer');
  const [ran, setRan] = React.useState(false);
  const [repairing, setRepairing] = React.useState(false);
  const [streamEvts, setStream] = React.useState([]);
  const health = ID.health;
  const summary = health.summary;
  const issueRows = [...health.instances.phantoms.map(id => ({
    key: id,
    type: 'phantom',
    sev: 'broken',
    description: `Record key exists but no object: ${id}`
  })), ...health.instances.missing.map(id => ({
    key: id,
    type: 'missing',
    sev: 'caution',
    description: `Object missing from index: ${id}`
  })), ...(health.unique_indexes || []).flatMap(ix => [...ix.stale.map(v => ({
    key: `uidx:${ix.index_name}:${v}`,
    type: 'stale unique index',
    sev: 'caution',
    description: `${ix.index_name} → ${v}`
  })), ...(ix.missing || []).map(v => ({
    key: `uidx:miss:${v}`,
    type: 'missing unique index',
    sev: 'broken',
    description: `${ix.index_name} missing: ${v}`
  }))]), ...(health.multi_indexes || []).flatMap(ix => [...ix.stale_members.map(m => ({
    key: `midx:${ix.index_name}:${m}`,
    type: 'stale multi-member',
    sev: 'caution',
    description: `${ix.index_name}: ${m}`
  })), ...(ix.orphaned_keys || []).map(k => ({
    key: `midx:orp:${k}`,
    type: 'orphaned index key',
    sev: 'broken',
    description: k
  }))]), ...(health.participations || []).flatMap(p => p.stale_members.map(m => ({
    key: `part:${m.identifier}`,
    type: 'stale participation',
    sev: 'caution',
    description: `${p.collection_name}: ${m.identifier} (${m.reason})`
  })))];
  const doRepair = () => {
    setRepairing(true);
    const events = ID.repairStream;
    let i = 0;
    setStream([events[0]]);
    const tick = () => {
      i++;
      if (i < events.length) {
        setStream(prev => [...prev, events[i]]);
        setTimeout(tick, 600);
      } else {
        setRepairing(false);
      }
    };
    setTimeout(tick, 400);
  };
  const impactItems = [{
    label: 'Phantom records',
    value: '2',
    tone: 'broken'
  }, {
    label: 'Missing records',
    value: '1',
    tone: 'caution'
  }, {
    label: 'Stale unique index',
    value: '1',
    tone: 'caution'
  }, {
    label: 'Missing unique index',
    value: '1',
    tone: 'caution'
  }, {
    label: 'Stale multi-member',
    value: '1',
    tone: 'caution'
  }, {
    label: 'Orphaned index key',
    value: '1',
    tone: 'broken'
  }, {
    label: 'Stale participation',
    value: '1',
    tone: 'caution'
  }];
  const cols = [{
    key: 'sev',
    header: '',
    width: 28,
    render: v => React.createElement('span', {
      style: {
        width: 8,
        height: 8,
        borderRadius: 9999,
        background: `var(--admin-status-${v})`,
        display: 'inline-block'
      }
    })
  }, {
    key: 'type',
    header: 'Issue type',
    mono: true,
    width: 200
  }, {
    key: 'key',
    header: 'Identifier',
    mono: true,
    render: v => React.createElement(Mono, {
      size: 'sm',
      muted: true
    }, v)
  }, {
    key: 'description',
    header: 'Detail',
    mono: true
  }];
  return React.createElement('div', {
    style: {
      padding: 20,
      display: 'grid',
      gap: 20
    }
  }, /* Header */
  React.createElement('div', {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16
    }
  }, React.createElement('div', null, React.createElement('div', {
    style: {
      fontSize: 20,
      fontWeight: 600,
      marginBottom: 4
    }
  }, 'Integrity console'), React.createElement('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, React.createElement(StatusDot, {
    status: health.healthy ? 'healthy' : 'broken',
    label: health.healthy ? 'Healthy' : 'Issues found'
  }), React.createElement('span', {
    style: {
      fontFamily: 'var(--admin-mono)',
      fontSize: 12,
      color: 'var(--admin-text-muted)'
    }
  }, `checked ${new Date(health.checked_at * 1000).toISOString().slice(0, 10)}`), React.createElement(CountPair, {
    fast: health.instances.count_timeline,
    exact: health.instances.count_scan
  }))), React.createElement(Select, {
    value: model,
    onChange: e => setModel(e.target.value),
    options: [{
      value: 'Customer'
    }, {
      value: 'Session'
    }, {
      value: 'ApiKey'
    }]
  })), /* Summary badges */
  React.createElement('div', {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, Object.entries(summary.by_type).map(([k, v]) => React.createElement('div', {
    key: k,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 10px',
      background: 'var(--admin-surface)',
      border: 'var(--admin-border)',
      borderRadius: 'var(--admin-radius-sm)'
    }
  }, React.createElement('span', {
    style: {
      fontFamily: 'var(--admin-mono)',
      fontSize: 18,
      fontWeight: 700,
      color: 'var(--admin-status-broken)'
    }
  }, v), React.createElement('span', {
    style: {
      fontFamily: 'var(--admin-mono)',
      fontSize: 11,
      color: 'var(--admin-text-muted)'
    }
  }, k.replace(/_/g, ' '))))), /* Issue table */
  React.createElement('div', null, React.createElement('div', {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--admin-text-muted)',
      marginBottom: 8
    }
  }, 'Issue list'), React.createElement(DataTable, {
    columns: cols,
    rows: issueRows,
    rowKey: r => r.key
  })), /* Repair flow */
  React.createElement('div', null, React.createElement('div', {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--admin-text-muted)',
      marginBottom: 8
    }
  }, 'Repair'), React.createElement(DryRunConfirm, {
    title: `Repair ${model} integrity`,
    description: `${summary.total_issues} issues · last scan 3m ago`,
    impact: impactItems,
    applyLabel: 'Apply repair',
    onApply: doRepair,
    children: streamEvts.length > 0 ? React.createElement(ProgressStream, {
      events: streamEvts
    }) : null
  })));
}
Object.assign(window, {
  IntegrityView
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/familia_admin/IntegrityView.jsx", error: String((e && e.message) || e) }); }

// ui_kits/familia_admin/MigrationsView.jsx
try { (() => {
/* MigrationsView — drift summary + pending migration list + run dry-run flow.
 * Exports: MigrationsView to window. */
const {
  DataTable,
  Button,
  Badge,
  Banner,
  StatusDot,
  DryRunConfirm,
  ProgressStream,
  Mono,
  KeyValue
} = window.FamiliaAdminDesignSystem_a9098d;
const {
  ADMIN_DATA: MD
} = window;
function MigrationsView() {
  const [runEvts, setRunEvts] = React.useState([]);
  const [running, setRunning] = React.useState(false);
  const migs = MD.migrations;
  const doRun = () => {
    setRunning(true);
    const fakeStream = [{
      event: 'start',
      model: 'Customer',
      dry_run: false,
      at: Math.floor(Date.now() / 1000)
    }, {
      phase: 'rename_field',
      current: 1,
      total: 1282,
      result: null
    }, {
      phase: 'rename_field',
      current: 642,
      total: 1282,
      result: null
    }, {
      phase: 'rename_field',
      current: 1282,
      total: 1282,
      result: {
        renamed: 1282
      }
    }, {
      event: 'done',
      healthy: true,
      at: Math.floor(Date.now() / 1000) + 8,
      summary: {
        fields_renamed: 1282
      }
    }];
    let i = 0;
    setRunEvts([fakeStream[0]]);
    const tick = () => {
      i++;
      if (i < fakeStream.length) {
        setRunEvts(prev => [...prev, fakeStream[i]]);
        setTimeout(tick, 700);
      } else {
        setRunning(false);
      }
    };
    setTimeout(tick, 500);
  };
  const pendingCols = [{
    key: 'id',
    header: 'Migration ID',
    mono: true
  }, {
    key: 'description',
    header: 'Description'
  }, {
    key: 'reversible',
    header: 'Reversible',
    width: 90,
    align: 'center',
    render: v => React.createElement(Badge, {
      tone: v ? 'healthy' : 'caution',
      mono: true
    }, v ? 'yes' : 'no')
  }, {
    key: 'dependencies',
    header: 'Depends on',
    mono: true,
    render: v => v.length ? v.join(', ') : React.createElement('span', {
      style: {
        color: 'var(--admin-text-subtle)'
      }
    }, 'none')
  }];
  const appliedCols = [{
    key: 'id',
    header: 'Migration ID',
    mono: true
  }, {
    key: 'description',
    header: 'Description'
  }, {
    key: 'applied_at',
    header: 'Applied',
    mono: true,
    align: 'right',
    render: v => new Date(v * 1000).toISOString().slice(0, 10)
  }, {
    key: 'reversible',
    header: 'Reversible',
    width: 90,
    align: 'center',
    render: v => React.createElement(Badge, {
      tone: v ? 'neutral' : 'caution',
      mono: true
    }, v ? 'yes' : 'no')
  }];
  const driftCols = [{
    key: 'model',
    header: 'Model',
    mono: true,
    width: 120
  }, {
    key: 'changed',
    header: 'Drift',
    width: 80,
    render: v => React.createElement(StatusDot, {
      status: v ? 'caution' : 'healthy',
      label: v ? 'changed' : 'clean'
    })
  }, {
    key: 'stored_digest',
    header: 'Stored digest',
    mono: true
  }, {
    key: 'current_digest',
    header: 'Current digest',
    mono: true
  }, {
    key: 'differences',
    header: 'Changes',
    render: v => v.length ? v.map(d => React.createElement('span', {
      key: d.field,
      style: {
        marginRight: 8,
        fontFamily: 'var(--admin-mono)',
        fontSize: 11,
        color: d.change === 'removed' ? 'var(--admin-status-broken)' : 'var(--admin-status-healthy)'
      }
    }, `${d.field} ${d.change}`)) : React.createElement('span', {
      style: {
        color: 'var(--admin-text-subtle)',
        fontSize: 12
      }
    }, '—')
  }];
  return React.createElement('div', {
    style: {
      padding: 20,
      display: 'grid',
      gap: 24
    }
  }, React.createElement('div', null, React.createElement('div', {
    style: {
      fontSize: 20,
      fontWeight: 600,
      marginBottom: 4
    }
  }, 'Migrations'), React.createElement('div', {
    style: {
      fontSize: 12,
      color: 'var(--admin-text-muted)'
    }
  }, `${migs.applied.length} applied · ${migs.pending.length} pending`)), /* Schema drift */
  React.createElement('div', null, React.createElement('div', {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--admin-text-muted)',
      marginBottom: 8
    }
  }, 'Schema drift'), migs.drift.some(d => d.changed) && React.createElement(Banner, {
    tone: 'caution',
    style: {
      marginBottom: 10
    },
    title: 'Schema drift detected on 1 model'
  }, 'Customer model definition changed since last digest.'), React.createElement(DataTable, {
    columns: driftCols,
    rows: migs.drift,
    rowKey: r => r.model
  })), /* Pending */
  React.createElement('div', null, React.createElement('div', {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--admin-text-muted)',
      marginBottom: 8
    }
  }, 'Pending'), React.createElement(DataTable, {
    columns: pendingCols,
    rows: migs.pending,
    rowKey: r => r.id
  })), /* Run flow */
  React.createElement('div', null, React.createElement('div', {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--admin-text-muted)',
      marginBottom: 8
    }
  }, 'Run migrations'), React.createElement(DryRunConfirm, {
    title: 'Run 1 pending migration',
    description: '20260520_rename_fullname_to_name · reversible',
    impact: [{
      label: 'Estimated records',
      value: '1,282',
      tone: 'preview'
    }, {
      label: 'Operation',
      value: 'rename_field: fullname → name'
    }, {
      label: 'Reversible',
      value: 'yes',
      tone: 'healthy'
    }, {
      label: 'Backup',
      value: 'enabled',
      tone: 'healthy'
    }],
    applyLabel: 'Run migration',
    onApply: doRun,
    children: runEvts.length > 0 ? React.createElement(ProgressStream, {
      events: runEvts
    }) : null
  })), /* Applied */
  React.createElement('div', null, React.createElement('div', {
    style: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--admin-text-muted)',
      marginBottom: 8
    }
  }, 'Applied'), React.createElement(DataTable, {
    columns: appliedCols,
    rows: [...migs.applied].reverse(),
    rowKey: r => r.id
  })));
}
Object.assign(window, {
  MigrationsView
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/familia_admin/MigrationsView.jsx", error: String((e && e.message) || e) }); }

// ui_kits/familia_admin/ModelsView.jsx
try { (() => {
/* ModelsView — model list + model detail with tabs (Fields/DataTypes/Indexes).
 * Exports: ModelsView to window. */
const {
  DataTable,
  Badge,
  StatusDot,
  Tabs,
  KeyValue,
  FieldChip,
  Mono,
  Button,
  IconButton,
  Breadcrumb
} = window.FamiliaAdminDesignSystem_a9098d;
const {
  ADMIN_DATA,
  Icons
} = window;
function ModelsView({
  onBreadcrumb
}) {
  const [selectedModel, setSelectedModel] = React.useState(null);
  const [tab, setTab] = React.useState('fields');
  const models = ADMIN_DATA.models;
  React.useEffect(() => {
    if (selectedModel) {
      onBreadcrumb(React.createElement(Breadcrumb, {
        items: [{
          label: 'Models',
          onClick: () => {
            setSelectedModel(null);
            onBreadcrumb(null);
          }
        }, {
          label: selectedModel.class
        }]
      }));
    } else {
      onBreadcrumb(null);
    }
  }, [selectedModel]);
  if (selectedModel) return React.createElement(ModelDetail, {
    model: selectedModel,
    tab,
    setTab,
    onBack: () => {
      setSelectedModel(null);
      onBreadcrumb(null);
    }
  });
  const cols = [{
    key: 'class',
    header: 'Model',
    width: 160,
    render: (v, r) => React.createElement('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, React.createElement('span', {
      style: {
        fontFamily: 'var(--admin-mono)',
        fontSize: 12
      }
    }, v), r.logical_database != null && React.createElement(Badge, {
      tone: 'neutral',
      mono: true
    }, `db${r.logical_database}`))
  }, {
    key: 'model',
    header: 'Key prefix',
    mono: true,
    render: (v, r) => `${v}:{id}`
  }, {
    key: 'fields',
    header: 'Fields',
    align: 'right',
    render: (_, r) => r.fields.length
  }, {
    key: 'datatypes',
    header: 'DataTypes',
    align: 'right',
    render: (_, r) => r.datatypes.length
  }, {
    key: 'indexes',
    header: 'Indexes',
    align: 'right',
    render: (_, r) => r.indexes.length
  }, {
    key: 'expiration',
    header: 'TTL',
    render: (_, r) => r.expiration?.policy === 'ttl' ? `${Math.floor(r.expiration.default_seconds / 86400)}d` : 'none'
  }, {
    key: 'actions_col',
    header: '',
    width: 80,
    render: (_, r) => React.createElement('div', {
      style: {
        display: 'flex',
        gap: 4,
        justifyContent: 'flex-end'
      }
    }, React.createElement(Button, {
      size: 'sm',
      variant: 'ghost',
      onClick: e => {
        e.stopPropagation();
        setSelectedModel(r);
        setTab('fields');
      }
    }, 'Detail →'))
  }];
  return React.createElement('div', {
    style: {
      padding: 20
    }
  }, React.createElement('div', {
    style: {
      marginBottom: 12,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, React.createElement('div', null, React.createElement('div', {
    style: {
      fontSize: 20,
      fontWeight: 600,
      marginBottom: 2
    }
  }, 'Models'), React.createElement('div', {
    style: {
      fontSize: 12,
      color: 'var(--admin-text-muted)'
    }
  }, `${models.length} registered · Familia v2.10.1`)), React.createElement(Button, {
    variant: 'secondary',
    size: 'sm',
    iconLeft: React.createElement(Icons.refresh, null)
  }, 'Refresh descriptor')), React.createElement(DataTable, {
    columns: cols,
    rows: models,
    rowKey: r => r.model
  }));
}
function ModelDetail({
  model,
  tab,
  setTab,
  onBack
}) {
  const tabs = [{
    id: 'fields',
    label: 'Fields',
    count: model.fields.length
  }, {
    id: 'datatypes',
    label: 'DataTypes',
    count: model.datatypes.length
  }, {
    id: 'indexes',
    label: 'Indexes',
    count: model.indexes.length
  }];
  const catToStatus = {
    field: 'neutral',
    encrypted: 'caution',
    transient: 'preview'
  };
  return React.createElement('div', {
    style: {
      padding: 20
    }
  }, React.createElement('div', {
    style: {
      display: 'flex',
      gap: 20,
      marginBottom: 16,
      flexWrap: 'wrap'
    }
  }, React.createElement(KeyValue, {
    label: 'Class',
    value: model.class,
    mono: true
  }), React.createElement(KeyValue, {
    label: 'Key pattern',
    value: model.key_pattern,
    mono: true
  }), React.createElement(KeyValue, {
    label: 'Identifier',
    value: model.identifier_field,
    mono: true
  }), React.createElement(KeyValue, {
    label: 'TTL',
    value: model.expiration?.policy === 'ttl' ? `${Math.floor(model.expiration.default_seconds / 86400)}d` : 'none',
    mono: true
  })), React.createElement(Tabs, {
    tabs,
    activeId: tab,
    onChange: setTab,
    style: {
      marginBottom: 0
    }
  }), React.createElement('div', {
    style: {
      marginTop: 0
    }
  }, tab === 'fields' && React.createElement(DataTable, {
    rows: model.fields,
    rowKey: r => r.name,
    columns: [{
      key: 'category',
      header: 'Type',
      width: 130,
      render: (v, r) => React.createElement(FieldChip, {
        category: r.identifier ? 'identifier' : v
      })
    }, {
      key: 'name',
      header: 'Field',
      mono: true
    }, {
      key: 'persisted',
      header: 'Persisted',
      width: 90,
      align: 'center',
      render: v => v ? '✓' : '—'
    }, {
      key: 'display',
      header: 'Client value',
      mono: true,
      render: v => v || React.createElement('span', {
        style: {
          color: 'var(--admin-text-subtle)'
        }
      }, '(raw)')
    }]
  }), tab === 'datatypes' && (model.datatypes.length === 0 ? React.createElement('div', {
    style: {
      padding: '20px 0',
      color: 'var(--admin-text-muted)',
      fontSize: 12
    }
  }, 'No DataTypes attached.') : React.createElement(DataTable, {
    rows: model.datatypes,
    rowKey: r => r.name,
    columns: [{
      key: 'name',
      header: 'Name',
      mono: true
    }, {
      key: 'type',
      header: 'Type',
      mono: true
    }, {
      key: 'scope',
      header: 'Scope',
      render: v => React.createElement(Badge, {
        tone: 'neutral',
        mono: true
      }, v)
    }]
  })), tab === 'indexes' && (model.indexes.length === 0 ? React.createElement('div', {
    style: {
      padding: '20px 0',
      color: 'var(--admin-text-muted)',
      fontSize: 12
    }
  }, 'No indexes.') : React.createElement(DataTable, {
    rows: model.indexes,
    rowKey: r => r.index_name,
    columns: [{
      key: 'index_name',
      header: 'Index',
      mono: true
    }, {
      key: 'field',
      header: 'Field',
      mono: true
    }, {
      key: 'cardinality',
      header: 'Cardinality',
      render: v => React.createElement(Badge, {
        tone: v === 'unique' ? 'healthy' : 'neutral',
        mono: true
      }, v)
    }, {
      key: 'coordinate',
      header: 'Coordinate',
      mono: true
    }]
  }))));
}
Object.assign(window, {
  ModelsView
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/familia_admin/ModelsView.jsx", error: String((e && e.message) || e) }); }

// ui_kits/familia_admin/RecordsView.jsx
try { (() => {
/* RecordsView — records browser for customer model. Filter by status, paginate.
 * Exports: RecordsView to window. */
const {
  DataTable,
  Button,
  Input,
  Select,
  StatusDot,
  Mono,
  Badge,
  Breadcrumb,
  IconButton,
  Kbd,
  FieldChip,
  KeyValue,
  Banner
} = window.FamiliaAdminDesignSystem_a9098d;
const {
  ADMIN_DATA: RD,
  Icons: RI
} = window;
function RecordsView({
  onBreadcrumb
}) {
  const [filter, setFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [revealed, setRevealed] = React.useState(null); // {id, field, value}
  const [detailId, setDetailId] = React.useState(null);
  const allRows = RD.records.customer;
  const model = RD.models.find(m => m.model === 'customer');
  const filtered = allRows.filter(r => {
    const matchStatus = filter === 'all' || r.status === filter;
    const matchSearch = !search || r.custid.includes(search) || r.email.includes(search) || r.name.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });
  React.useEffect(() => {
    if (detailId) {
      const r = allRows.find(x => x.custid === detailId);
      onBreadcrumb(React.createElement(Breadcrumb, {
        items: [{
          label: 'Models',
          onClick: () => {
            setDetailId(null);
            onBreadcrumb(null);
          }
        }, {
          label: 'Customer',
          onClick: () => {
            setDetailId(null);
            onBreadcrumb(null);
          }
        }, {
          label: detailId,
          mono: true
        }]
      }));
    } else {
      onBreadcrumb(null);
    }
  }, [detailId]);
  if (detailId) {
    const rec = allRows.find(r => r.custid === detailId);
    return React.createElement(RecordDetail, {
      record: rec,
      model,
      revealed,
      onReveal: () => setRevealed({
        id: detailId,
        field: 'api_secret',
        value: 'sk_live_9f8c2a7b1e4d6093'
      }),
      onBack: () => {
        setDetailId(null);
        onBreadcrumb(null);
      }
    });
  }
  const statusMap = {
    active: 'healthy',
    pending: 'caution',
    inactive: 'neutral'
  };
  const cols = [{
    key: 'custid',
    header: 'Identifier',
    mono: true,
    width: 140
  }, {
    key: 'status',
    header: 'Status',
    width: 120,
    render: v => React.createElement(StatusDot, {
      status: statusMap[v] || 'neutral',
      label: v
    })
  }, {
    key: 'name',
    header: 'Name'
  }, {
    key: 'email',
    header: 'Email',
    mono: true
  }, {
    key: 'updated_at',
    header: 'Updated',
    align: 'right',
    mono: true,
    render: v => new Date(v * 1000).toISOString().slice(0, 10)
  }, {
    key: 'api_secret',
    header: 'api_secret',
    mono: true,
    render: v => React.createElement('span', {
      style: {
        color: 'var(--admin-text-subtle)',
        fontFamily: 'var(--admin-mono)',
        fontSize: 11
      }
    }, '[CONCEALED]')
  }, {
    key: '_actions',
    header: '',
    width: 60,
    render: (_, r) => React.createElement(Button, {
      size: 'sm',
      variant: 'ghost',
      onClick: e => {
        e.stopPropagation();
        setDetailId(r.custid);
      }
    }, 'View')
  }];
  return React.createElement('div', {
    style: {
      padding: 20
    }
  }, React.createElement('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12
    }
  }, React.createElement('div', null, React.createElement('div', {
    style: {
      fontSize: 20,
      fontWeight: 600,
      marginBottom: 2
    }
  }, 'Customer'), React.createElement('div', {
    style: {
      fontSize: 12,
      color: 'var(--admin-text-muted)',
      fontFamily: 'var(--admin-mono)'
    }
  }, 'customer:{custid}:object · 1,284 ≈ · 1,282 scan')), React.createElement(Button, {
    variant: 'primary',
    size: 'sm',
    iconLeft: React.createElement(RI.plus, null)
  }, 'New record')), React.createElement('div', {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 10
    }
  }, React.createElement(Input, {
    style: {
      width: 260
    },
    mono: true,
    placeholder: 'Search by id, email, name…',
    prefix: React.createElement(RI.search, null),
    value: search,
    onChange: e => setSearch(e.target.value)
  }), React.createElement(Select, {
    value: filter,
    onChange: e => setFilter(e.target.value),
    options: [{
      value: 'all',
      label: 'All statuses'
    }, {
      value: 'active',
      label: 'Active'
    }, {
      value: 'pending',
      label: 'Pending'
    }, {
      value: 'inactive',
      label: 'Inactive'
    }]
  }), React.createElement('span', {
    style: {
      marginLeft: 'auto',
      fontSize: 12,
      color: 'var(--admin-text-muted)',
      alignSelf: 'center'
    }
  }, `${filtered.length} rows`)), React.createElement(DataTable, {
    columns: cols,
    rows: filtered,
    rowKey: r => r.custid,
    emptyMessage: 'No matching records.'
  }));
}
function RecordDetail({
  record,
  model,
  revealed,
  onReveal,
  onBack
}) {
  const [revealBusy, setRevealBusy] = React.useState(false);
  const [loggedNotice, setLoggedNotice] = React.useState(false);
  const doReveal = () => {
    setRevealBusy(true);
    setTimeout(() => {
      onReveal();
      setLoggedNotice(true);
      setRevealBusy(false);
    }, 900);
  };
  const statusMap = {
    active: 'healthy',
    pending: 'caution',
    inactive: 'neutral'
  };
  const fields = model.fields.filter(f => f.client_visible !== false);
  return React.createElement('div', {
    style: {
      padding: 20
    }
  }, React.createElement('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      marginBottom: 16
    }
  }, React.createElement(StatusDot, {
    status: statusMap[record.status] || 'neutral',
    label: record.status
  }), React.createElement('div', {
    style: {
      fontFamily: 'var(--admin-mono)',
      fontSize: 13,
      color: 'var(--admin-text-muted)'
    }
  }, `_key: customer:${record.custid}:object`)), loggedNotice && React.createElement(Banner, {
    tone: 'preview',
    style: {
      marginBottom: 14
    },
    title: 'Reveal logged — this action was written to the audit trail.'
  }), React.createElement('div', {
    style: {
      border: 'var(--admin-border)',
      borderRadius: 'var(--admin-radius)',
      background: 'var(--admin-surface)',
      overflow: 'hidden',
      marginBottom: 16
    }
  }, fields.map((f, i) => {
    const isEncrypted = f.category === 'encrypted';
    const value = isEncrypted ? revealed && revealed.field === f.name ? React.createElement('span', {
      style: {
        fontFamily: 'var(--admin-mono)',
        fontSize: 12,
        color: 'var(--admin-status-healthy)'
      }
    }, revealed.value) : React.createElement('span', {
      style: {
        color: 'var(--admin-text-subtle)',
        fontFamily: 'var(--admin-mono)',
        fontSize: 11
      }
    }, '[CONCEALED]') : React.createElement(Mono, {
      size: 'sm'
    }, String(record[f.name] ?? '—'));
    return React.createElement('div', {
      key: f.name,
      style: {
        display: 'grid',
        gridTemplateColumns: '160px 1fr auto',
        alignItems: 'center',
        padding: '7px 14px',
        borderTop: i ? '1px solid var(--admin-border-color)' : 'none'
      }
    }, React.createElement('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, React.createElement(FieldChip, {
      category: f.identifier ? 'identifier' : f.category
    }), React.createElement('span', {
      style: {
        fontFamily: 'var(--admin-mono)',
        fontSize: 12
      }
    }, f.name)), React.createElement('div', null, value), isEncrypted && !revealed && React.createElement(Button, {
      size: 'sm',
      variant: 'ghost',
      loading: revealBusy,
      iconLeft: React.createElement(RI.eye, null),
      onClick: doReveal
    }, 'Reveal'));
  })), React.createElement('div', {
    style: {
      fontSize: 11,
      color: 'var(--admin-text-subtle)',
      fontFamily: 'var(--admin-mono)'
    }
  }, 'Collections: recent_logins · feature_flags · domains (sorted_set) · metadata (hashkey) · login_count=318'));
}
Object.assign(window, {
  RecordsView
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/familia_admin/RecordsView.jsx", error: String((e && e.message) || e) }); }

// ui_kits/familia_admin/components.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * ui_kits/familia_admin/components.jsx
 * Self-contained component definitions for the UI kit preview.
 * Does NOT use import/export — assigns everything to window.FA.
 */
const FA = {};
window.FamiliaAdminDesignSystem_a9098d = FA;

/* ---- Button ---- */
FA.Button = function Button({
  children,
  variant = 'secondary',
  size = 'md',
  type = 'button',
  disabled = false,
  loading = false,
  iconLeft,
  iconRight,
  onClick,
  style,
  ...rest
}) {
  const h = {
    sm: 24,
    md: 28,
    lg: 32
  }[size] || 28;
  const fs = size === 'lg' ? 13 : 12;
  const px = size === 'sm' ? 8 : size === 'lg' ? 14 : 10;
  const vs = {
    primary: {
      background: 'var(--admin-accent)',
      color: 'var(--admin-accent-on)',
      border: '1px solid var(--admin-accent)',
      fontWeight: 600
    },
    secondary: {
      background: 'var(--admin-surface-raised)',
      color: 'var(--admin-text)',
      border: '1px solid var(--admin-border-strong)',
      fontWeight: 500
    },
    ghost: {
      background: 'transparent',
      color: 'var(--admin-text)',
      border: '1px solid transparent',
      fontWeight: 500
    },
    danger: {
      background: 'var(--admin-status-broken)',
      color: '#fff',
      border: '1px solid var(--admin-status-broken)',
      fontWeight: 600
    }
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled || loading,
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: h,
      padding: `0 ${px}px`,
      fontFamily: 'var(--admin-font-family)',
      fontSize: fs,
      lineHeight: 1,
      letterSpacing: .1,
      borderRadius: 'var(--admin-radius-sm)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      whiteSpace: 'nowrap',
      transition: 'background 90ms ease',
      ...vs[variant],
      ...style
    }
  }, rest), loading ? /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    style: {
      animation: 'admin-spin .8s linear infinite'
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "6",
    r: "4.5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeOpacity: ".25"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 1.5A4.5 4.5 0 0110.5 6",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  })) : iconLeft, /*#__PURE__*/React.createElement("span", null, children), iconRight);
};

/* ---- IconButton ---- */
FA.IconButton = function IconButton({
  children,
  ariaLabel,
  size = 'md',
  variant = 'ghost',
  disabled = false,
  onClick,
  style,
  ...rest
}) {
  const dim = {
    sm: 22,
    md: 26,
    lg: 30
  }[size] || 26;
  const vs = {
    ghost: {
      background: 'transparent',
      border: '1px solid transparent',
      color: 'var(--admin-text-muted)'
    },
    bordered: {
      background: 'var(--admin-surface-raised)',
      border: '1px solid var(--admin-border-strong)',
      color: 'var(--admin-text)'
    }
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": ariaLabel,
    title: ariaLabel,
    disabled: disabled,
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: dim,
      height: dim,
      borderRadius: 'var(--admin-radius-sm)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .4 : 1,
      ...vs[variant],
      ...style
    }
  }, rest), children);
};

/* ---- Badge ---- */
FA.Badge = function Badge({
  children,
  tone = 'neutral',
  variant = 'solid',
  mono = false,
  uppercase = false,
  style,
  ...rest
}) {
  const bg = {
    neutral: {
      solid: {
        bg: 'var(--admin-surface-sunken)',
        fg: 'var(--admin-text)',
        bd: 'var(--admin-border-color)'
      },
      outline: {
        bg: 'transparent',
        fg: 'var(--admin-text-muted)',
        bd: 'var(--admin-border-strong)'
      }
    },
    accent: {
      solid: {
        bg: 'rgba(232,121,249,.16)',
        fg: 'var(--admin-accent)',
        bd: 'rgba(232,121,249,.3)'
      },
      outline: {
        bg: 'transparent',
        fg: 'var(--admin-accent)',
        bd: 'var(--admin-accent)'
      }
    },
    healthy: {
      solid: {
        bg: 'var(--admin-status-healthy-bg)',
        fg: 'var(--admin-status-healthy)',
        bd: 'transparent'
      },
      outline: {
        bg: 'transparent',
        fg: 'var(--admin-status-healthy)',
        bd: 'var(--admin-status-healthy)'
      }
    },
    caution: {
      solid: {
        bg: 'var(--admin-status-caution-bg)',
        fg: 'var(--admin-status-caution)',
        bd: 'transparent'
      },
      outline: {
        bg: 'transparent',
        fg: 'var(--admin-status-caution)',
        bd: 'var(--admin-status-caution)'
      }
    },
    broken: {
      solid: {
        bg: 'var(--admin-status-broken-bg)',
        fg: 'var(--admin-status-broken)',
        bd: 'transparent'
      },
      outline: {
        bg: 'transparent',
        fg: 'var(--admin-status-broken)',
        bd: 'var(--admin-status-broken)'
      }
    },
    preview: {
      solid: {
        bg: 'var(--admin-status-preview-bg)',
        fg: 'var(--admin-status-preview)',
        bd: 'transparent'
      },
      outline: {
        bg: 'transparent',
        fg: 'var(--admin-status-preview)',
        bd: 'var(--admin-status-preview)'
      }
    }
  };
  const t = bg[tone]?.[variant] || bg.neutral.solid;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      height: 18,
      padding: '0 6px',
      fontFamily: mono ? 'var(--admin-mono)' : 'inherit',
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: uppercase ? .05 : 0.1,
      textTransform: uppercase ? 'uppercase' : 'none',
      borderRadius: 'var(--admin-radius-sm)',
      background: t.bg,
      color: t.fg,
      border: `1px solid ${t.bd}`,
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), children);
};

/* ---- StatusDot ---- */
FA.StatusDot = function StatusDot({
  status = 'neutral',
  size = 8,
  label,
  mono = false,
  style,
  ...rest
}) {
  const c = {
    healthy: 'var(--admin-status-healthy)',
    caution: 'var(--admin-status-caution)',
    broken: 'var(--admin-status-broken)',
    preview: 'var(--admin-status-preview)',
    neutral: 'var(--admin-status-neutral)'
  }[status] || 'var(--admin-status-neutral)';
  if (!label) return /*#__PURE__*/React.createElement("span", _extends({
    "aria-label": status,
    role: "img",
    style: {
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: 9999,
      background: c,
      flex: 'none',
      ...style
    }
  }, rest));
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: size,
      height: size,
      borderRadius: 9999,
      background: c,
      flex: 'none'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: mono ? 'var(--admin-mono)' : 'inherit',
      fontSize: 12
    }
  }, label));
};

/* ---- Mono ---- */
FA.Mono = function Mono({
  children,
  size = 'base',
  muted = false,
  style,
  ...rest
}) {
  const fs = {
    xs: 10,
    sm: 11,
    base: 12,
    md: 13
  }[size] || 12;
  return /*#__PURE__*/React.createElement("code", _extends({
    style: {
      fontFamily: 'var(--admin-mono)',
      fontSize: fs,
      fontFeatureSettings: '"liga" 0,"calt" 0',
      color: muted ? 'var(--admin-text-muted)' : 'inherit',
      background: 'transparent',
      ...style
    }
  }, rest), children);
};

/* ---- Kbd ---- */
FA.Kbd = function Kbd({
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("kbd", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 18,
      height: 18,
      padding: '0 5px',
      fontFamily: 'var(--admin-mono)',
      fontSize: 11,
      fontWeight: 500,
      background: 'var(--admin-surface-sunken)',
      border: '1px solid var(--admin-border-color)',
      borderBottomWidth: 2,
      borderRadius: 4,
      color: 'var(--admin-text-muted)',
      ...style
    }
  }, rest), children);
};

/* ---- FieldChip ---- */
FA.FieldChip = function FieldChip({
  category,
  style,
  ...rest
}) {
  const m = {
    identifier: {
      label: 'ID',
      bg: 'rgba(168,85,247,.16)',
      color: 'var(--admin-field-identifier)',
      border: 'transparent',
      bs: 'solid'
    },
    encrypted: {
      label: '[CONCEALED]',
      bg: 'var(--admin-surface-sunken)',
      color: 'var(--admin-field-encrypted)',
      border: 'var(--admin-border-color)',
      bs: 'solid'
    },
    transient: {
      label: '[REDACTED]',
      bg: 'transparent',
      color: 'var(--admin-field-transient)',
      border: 'var(--admin-border-strong)',
      bs: 'dashed'
    },
    plain: {
      label: 'field',
      bg: 'transparent',
      color: 'var(--admin-text-muted)',
      border: 'var(--admin-border-color)',
      bs: 'solid'
    }
  };
  const t = m[category] || m.plain;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      height: 18,
      padding: '0 7px',
      fontFamily: 'var(--admin-mono)',
      fontSize: 10,
      fontWeight: 600,
      borderRadius: 9999,
      background: t.bg,
      color: t.color,
      border: `1px ${t.bs} ${t.border}`,
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), t.label);
};

/* ---- CountPair ---- */
FA.CountPair = function CountPair({
  fast,
  exact,
  fastLabel = 'timeline',
  exactLabel = 'scan',
  style
}) {
  const dis = exact != null && fast != null && fast !== exact;
  const d = n => n == null ? '—' : n.toLocaleString();
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'baseline',
      gap: 8,
      fontFamily: 'var(--admin-mono)',
      fontSize: 12,
      color: dis ? 'var(--admin-status-caution)' : 'var(--admin-text)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    title: fastLabel
  }, "\u2248 ", d(fast)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--admin-text-subtle)',
      fontSize: 11
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    title: exactLabel,
    style: {
      color: dis ? 'var(--admin-status-caution)' : 'var(--admin-text-muted)'
    }
  }, d(exact), " ", exactLabel));
};

/* ---- KeyValue ---- */
FA.KeyValue = function KeyValue({
  label,
  value,
  mono = false,
  layout = 'stack',
  style
}) {
  const row = layout === 'row';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: row ? 'grid' : 'flex',
      gridTemplateColumns: row ? '120px 1fr' : undefined,
      flexDirection: row ? undefined : 'column',
      gap: row ? 12 : 4,
      alignItems: row ? 'baseline' : 'stretch',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: 'var(--admin-tracking-eyebrow)',
      textTransform: 'uppercase',
      color: 'var(--admin-text-muted)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: mono ? 'var(--admin-mono)' : 'inherit',
      fontSize: 13,
      color: 'var(--admin-text)',
      wordBreak: 'break-all'
    }
  }, value));
};

/* ---- Input ---- */
FA.Input = function Input({
  size = 'md',
  mono = false,
  invalid = false,
  prefix,
  suffix,
  style,
  inputStyle,
  ...rest
}) {
  const h = {
    sm: 24,
    md: 28,
    lg: 32
  }[size] || 28;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      height: h,
      background: 'var(--admin-bg)',
      border: `1px solid ${invalid ? 'var(--admin-status-broken)' : 'var(--admin-border-strong)'}`,
      borderRadius: 'var(--admin-radius-sm)',
      paddingLeft: prefix ? 8 : 0,
      paddingRight: suffix ? 8 : 0,
      ...style
    }
  }, prefix && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--admin-text-muted)',
      fontFamily: mono ? 'var(--admin-mono)' : 'inherit',
      fontSize: 12,
      paddingRight: 6,
      borderRight: '1px solid var(--admin-border-color)',
      marginRight: 6,
      height: '100%',
      display: 'inline-flex',
      alignItems: 'center'
    }
  }, prefix), /*#__PURE__*/React.createElement("input", _extends({
    style: {
      flex: 1,
      height: '100%',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      padding: '0 8px',
      fontFamily: mono ? 'var(--admin-mono)' : 'inherit',
      fontSize: 12,
      color: 'var(--admin-text)',
      ...inputStyle
    }
  }, rest)), suffix && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--admin-text-muted)',
      fontSize: 12,
      paddingLeft: 6,
      marginLeft: 6,
      borderLeft: '1px solid var(--admin-border-color)',
      height: '100%',
      display: 'inline-flex',
      alignItems: 'center'
    }
  }, suffix));
};

/* ---- Select ---- */
FA.Select = function Select({
  size = 'md',
  options = [],
  mono = false,
  style,
  ...rest
}) {
  const h = {
    sm: 24,
    md: 28,
    lg: 32
  }[size] || 28;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'inline-block',
      height: h,
      ...style
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    style: {
      appearance: 'none',
      height: h,
      padding: `0 26px 0 8px`,
      background: 'var(--admin-bg)',
      color: 'var(--admin-text)',
      border: '1px solid var(--admin-border-strong)',
      borderRadius: 'var(--admin-radius-sm)',
      fontFamily: mono ? 'var(--admin-mono)' : 'inherit',
      fontSize: 12
    }
  }, rest), options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label || o.value))), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 12 12",
    width: "10",
    height: "10",
    style: {
      position: 'absolute',
      right: 8,
      top: '50%',
      transform: 'translateY(-50%)',
      pointerEvents: 'none',
      color: 'var(--admin-text-muted)'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 5L6 8L9 5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })));
};

/* ---- Switch ---- */
FA.Switch = function Switch({
  checked = false,
  onChange,
  disabled = false,
  label,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", {
    role: "switch",
    type: "button",
    "aria-checked": checked,
    onClick: () => !disabled && onChange && onChange(!checked),
    disabled: disabled,
    style: {
      width: 28,
      height: 16,
      border: 'none',
      padding: 0,
      background: checked ? 'var(--admin-accent)' : 'var(--admin-border-strong)',
      borderRadius: 9999,
      position: 'relative',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'background 90ms ease'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      width: 12,
      height: 12,
      background: '#fff',
      borderRadius: 9999,
      position: 'absolute',
      top: 2,
      left: checked ? 14 : 2,
      transition: 'left 90ms ease',
      boxShadow: '0 1px 2px rgba(0,0,0,.25)'
    }
  })), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--admin-text)'
    }
  }, label));
};

/* ---- Checkbox ---- */
FA.Checkbox = function Checkbox({
  checked = false,
  onChange,
  disabled = false,
  label,
  indeterminate = false,
  style
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    ref: ref,
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked),
    style: {
      accentColor: 'var(--admin-accent)',
      width: 14,
      height: 14
    }
  }), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--admin-text)'
    }
  }, label));
};

/* ---- DataTable ---- */
FA.DataTable = function DataTable({
  columns,
  rows,
  rowKey = r => r.id || r.key,
  selectable = false,
  selected = [],
  onSelectChange,
  emptyMessage = 'No rows.',
  style
}) {
  const allSel = selectable && rows.length > 0 && selected.length === rows.length;
  const toggle = k => onSelectChange && onSelectChange(selected.includes(k) ? selected.filter(x => x !== k) : [...selected, k]);
  const toggleAll = () => onSelectChange && onSelectChange(allSel ? [] : rows.map(rowKey));
  const th = c => ({
    height: 28,
    padding: '0 12px',
    textAlign: c.align || 'left',
    width: c.width,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 'var(--admin-tracking-eyebrow)',
    textTransform: 'uppercase',
    color: 'var(--admin-text-muted)',
    borderBottom: '1px solid var(--admin-border-color)',
    whiteSpace: 'nowrap'
  });
  const td = c => ({
    padding: '0 12px',
    textAlign: c.align || 'left',
    width: c.width,
    fontSize: 13,
    color: 'var(--admin-text)',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap'
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--admin-surface)',
      border: 'var(--admin-border)',
      borderRadius: 'var(--admin-radius)',
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: 'var(--admin-surface-sunken)'
    }
  }, selectable && /*#__PURE__*/React.createElement("th", {
    style: th({
      width: 28,
      align: 'center'
    })
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: allSel,
    onChange: toggleAll,
    style: {
      accentColor: 'var(--admin-accent)'
    }
  })), columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    style: th(c)
  }, c.header)))), /*#__PURE__*/React.createElement("tbody", null, rows.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: columns.length + (selectable ? 1 : 0),
    style: {
      height: 64,
      textAlign: 'center',
      color: 'var(--admin-text-muted)',
      fontSize: 12
    }
  }, emptyMessage)), rows.map((row, i) => {
    const k = rowKey(row) ?? i;
    const isSel = selectable && selected.includes(k);
    return /*#__PURE__*/React.createElement("tr", {
      key: k,
      style: {
        height: 'var(--admin-row-height)',
        borderTop: '1px solid var(--admin-border-color)',
        background: isSel ? 'var(--admin-selection-bg)' : 'transparent'
      }
    }, selectable && /*#__PURE__*/React.createElement("td", {
      style: td({
        align: 'center',
        width: 28
      })
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: isSel,
      onChange: () => toggle(k),
      style: {
        accentColor: 'var(--admin-accent)'
      }
    })), columns.map(c => {
      const v = row[c.key];
      const content = c.render ? c.render(v, row) : v;
      return /*#__PURE__*/React.createElement("td", {
        key: c.key,
        style: td(c)
      }, c.mono ? /*#__PURE__*/React.createElement("code", {
        style: {
          fontFamily: 'var(--admin-mono)',
          fontSize: 12
        }
      }, content) : content);
    }));
  }))));
};

/* ---- Banner ---- */
FA.Banner = function Banner({
  tone = 'preview',
  title,
  children,
  actions,
  style
}) {
  const cs = {
    healthy: 'var(--admin-status-healthy)',
    caution: 'var(--admin-status-caution)',
    broken: 'var(--admin-status-broken)',
    preview: 'var(--admin-status-preview)',
    neutral: 'var(--admin-status-neutral)'
  };
  const bs = {
    healthy: 'var(--admin-status-healthy-bg)',
    caution: 'var(--admin-status-caution-bg)',
    broken: 'var(--admin-status-broken-bg)',
    preview: 'var(--admin-status-preview-bg)',
    neutral: 'var(--admin-surface-sunken)'
  };
  const c = cs[tone],
    b = bs[tone];
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '10px 14px',
      background: b,
      border: `1px solid ${c}40`,
      borderLeft: `3px solid ${c}`,
      borderRadius: 'var(--admin-radius-sm)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 9999,
      background: c,
      marginTop: 6,
      flex: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--admin-text)'
    }
  }, title), children && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--admin-text-muted)',
      marginTop: title ? 2 : 0
    }
  }, children)), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, actions));
};

/* ---- ProgressStream ---- */
FA.ProgressStream = function ProgressStream({
  events = [],
  style
}) {
  const phOrder = [],
    phMap = {};
  let start = null,
    done = null;
  for (const e of events) {
    if (e.event === 'start') start = e;else if (e.event === 'done') done = e;else if (e.phase) {
      if (!(e.phase in phMap)) {
        phOrder.push(e.phase);
        phMap[e.phase] = {
          events: []
        };
      }
      phMap[e.phase].events.push(e);
    }
  }
  const phases = phOrder.map(name => {
    const evs = phMap[name].events;
    const last = evs[evs.length - 1];
    return {
      name,
      current: last.current,
      total: last.total,
      result: last.result,
      complete: last.current === last.total
    };
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: 'var(--admin-border)',
      borderRadius: 'var(--admin-radius)',
      background: 'var(--admin-surface)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 14px',
      borderBottom: '1px solid var(--admin-border-color)',
      fontSize: 11,
      color: 'var(--admin-text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 9999,
      background: done ? done.healthy ? 'var(--admin-status-healthy)' : 'var(--admin-status-broken)' : 'var(--admin-status-preview)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--admin-mono)',
      color: 'var(--admin-text)'
    }
  }, start?.dry_run ? 'dry-run · ' : 'apply · ', start?.model || '—'), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontFamily: 'var(--admin-mono)'
    }
  }, done ? `done · ${done.at - start?.at}s` : start ? 'streaming…' : 'pending')), phases.map((p, i) => {
    const pct = p.total ? Math.round(p.current / p.total * 100) : 0;
    return /*#__PURE__*/React.createElement("div", {
      key: p.name,
      style: {
        display: 'grid',
        gridTemplateColumns: '160px 1fr 80px',
        gap: 12,
        alignItems: 'center',
        padding: '6px 14px',
        borderTop: i ? '1px solid var(--admin-border-color)' : 'none'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: 9999,
        background: p.complete ? 'var(--admin-status-healthy)' : 'var(--admin-status-preview)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--admin-mono)',
        fontSize: 11
      }
    }, p.name)), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 4,
        background: 'var(--admin-surface-sunken)',
        borderRadius: 9999,
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: `${pct}%`,
        height: '100%',
        background: p.complete ? 'var(--admin-status-healthy)' : 'var(--admin-accent)',
        transition: 'width 160ms ease'
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--admin-mono)',
        fontSize: 11,
        color: 'var(--admin-text-muted)',
        textAlign: 'right'
      }
    }, p.current?.toLocaleString(), "/", p.total?.toLocaleString()));
  }), phases.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 14,
      fontSize: 12,
      color: 'var(--admin-text-muted)'
    }
  }, "Waiting for first event\u2026"), done && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 14px',
      borderTop: '1px solid var(--admin-border-color)',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      color: done.healthy ? 'var(--admin-status-healthy)' : 'var(--admin-status-broken)'
    }
  }, done.healthy ? 'Healthy.' : 'Issues remain.'), done.summary && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 8,
      color: 'var(--admin-text-muted)',
      fontFamily: 'var(--admin-mono)',
      fontSize: 11
    }
  }, Object.entries(done.summary).map(([k, v]) => `${k}=${v}`).join('  '))));
};

/* ---- DryRunConfirm ---- */
FA.DryRunConfirm = function DryRunConfirm({
  title,
  description,
  impact,
  ackLabel = 'I understand this is permanent.',
  applyLabel = 'Apply',
  dryRunLabel = 'Run dry-run',
  onDryRun,
  onApply,
  variant = 'panel',
  initialStep = 'idle',
  children,
  style
}) {
  const [step, setStep] = React.useState(initialStep);
  const [ack, setAck] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const runDry = async () => {
    setBusy(true);
    try {
      if (onDryRun) await onDryRun();
    } finally {
      setBusy(false);
      setStep('preview');
    }
  };
  const apply = async () => {
    setBusy(true);
    setStep('applying');
    try {
      if (onApply) await onApply();
      setStep('done');
    } finally {
      setBusy(false);
    }
  };
  const reset = () => {
    setStep('idle');
    setAck(false);
  };
  const b = (v, mute = false) => ({
    height: 28,
    padding: '0 12px',
    fontFamily: 'var(--admin-font-family)',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 'var(--admin-radius-sm)',
    cursor: mute ? 'not-allowed' : 'pointer',
    opacity: mute ? .5 : 1,
    border: '1px solid transparent',
    transition: 'background 90ms ease',
    ...{
      primary: {
        background: 'var(--admin-accent)',
        color: 'var(--admin-accent-on)'
      },
      danger: {
        background: 'var(--admin-status-broken)',
        color: '#fff'
      },
      secondary: {
        background: 'var(--admin-surface-raised)',
        color: 'var(--admin-text)',
        borderColor: 'var(--admin-border-strong)'
      }
    }[v]
  });
  const OrderRail = () => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 10,
      fontFamily: 'var(--admin-mono)',
      color: 'var(--admin-text-muted)'
    }
  }, ['dry-run', 'preview', 'confirm', 'apply'].map((s, i) => {
    const order = ['idle', 'preview', 'confirm', 'applying'];
    const cur = step === 'done' ? 'applying' : step;
    const active = order.indexOf(cur) >= i;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: s
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color: active ? 'var(--admin-text)' : 'var(--admin-text-subtle)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: 9999,
        background: active ? 'var(--admin-accent)' : 'var(--admin-border-strong)'
      }
    }), s), i < 3 && /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--admin-text-subtle)'
      }
    }, "\u2192"));
  }));
  const inner = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 16px',
      borderBottom: '1px solid var(--admin-border-color)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--admin-text)'
    }
  }, title), description && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--admin-text-muted)',
      marginTop: 2
    }
  }, description)), /*#__PURE__*/React.createElement(OrderRail, null)), step === 'idle' && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--admin-text-muted)'
    }
  }, "Start with a ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--admin-text)'
    }
  }, "dry-run"), ". Nothing will be written until you confirm."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: runDry,
    disabled: busy,
    style: b('primary')
  }, dryRunLabel))), (step === 'preview' || step === 'confirm') && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16,
      display: 'grid',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: 'var(--admin-status-preview-bg)',
      border: '1px solid rgba(2,132,199,.25)',
      borderLeft: '3px solid var(--admin-status-preview)',
      borderRadius: 'var(--admin-radius-sm)',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 9999,
      background: 'var(--admin-status-preview)'
    }
  }), /*#__PURE__*/React.createElement("span", null, "Dry-run results \u2014 nothing has been applied.")), impact && /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid var(--admin-border-color)',
      borderRadius: 'var(--admin-radius-sm)',
      overflow: 'hidden'
    }
  }, impact.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      alignItems: 'center',
      padding: '6px 12px',
      borderTop: i ? '1px solid var(--admin-border-color)' : 'none',
      background: 'var(--admin-bg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, it.tone && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 9999,
      background: `var(--admin-status-${it.tone})`
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12
    }
  }, it.label)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--admin-mono)',
      fontSize: 12
    }
  }, it.value)))), children, step === 'confirm' && /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      border: '1px solid var(--admin-status-broken)',
      background: 'var(--admin-status-broken-bg)',
      borderRadius: 'var(--admin-radius-sm)',
      cursor: 'pointer',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: ack,
    onChange: e => setAck(e.target.checked),
    style: {
      accentColor: 'var(--admin-status-broken)'
    }
  }), ackLabel), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      justifyContent: 'flex-end',
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: reset,
    style: b('secondary'),
    disabled: busy
  }, "Cancel"), step === 'preview' ? /*#__PURE__*/React.createElement("button", {
    onClick: () => setStep('confirm'),
    style: b('primary'),
    disabled: busy
  }, "Continue") : /*#__PURE__*/React.createElement("button", {
    onClick: apply,
    style: b('danger', !ack),
    disabled: !ack || busy
  }, applyLabel))), step === 'applying' && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16,
      display: 'grid',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--admin-text-muted)'
    }
  }, "Applying\u2026"), children), step === 'done' && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16,
      display: 'grid',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: 'var(--admin-status-healthy-bg)',
      border: '1px solid rgba(5,150,105,.25)',
      borderLeft: '3px solid var(--admin-status-healthy)',
      borderRadius: 'var(--admin-radius-sm)',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 9999,
      background: 'var(--admin-status-healthy)'
    }
  }), /*#__PURE__*/React.createElement("span", null, "Applied.")), children, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: reset,
    style: b('secondary')
  }, "Close"))));
  return variant === 'dialog' ? /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,.55)',
      backdropFilter: 'blur(2px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 560,
      maxWidth: 'calc(100% - 32px)',
      background: 'var(--admin-surface-raised)',
      border: '1px solid var(--admin-border-color)',
      borderRadius: 'var(--admin-radius-lg)',
      boxShadow: 'var(--otto-shadow-lg)',
      overflow: 'hidden'
    }
  }, inner)) : /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--admin-surface)',
      border: 'var(--admin-border)',
      borderRadius: 'var(--admin-radius)',
      overflow: 'hidden',
      ...style
    }
  }, inner);
};

/* ---- Sidebar ---- */
FA.Sidebar = function Sidebar({
  logo,
  items = [],
  footer,
  activeId,
  onNavigate,
  style
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      width: 'var(--admin-sidebar-w)',
      height: '100%',
      background: 'var(--admin-surface)',
      borderRight: 'var(--admin-border)',
      display: 'flex',
      flexDirection: 'column',
      flex: 'none',
      ...style
    }
  }, logo && /*#__PURE__*/React.createElement("div", {
    style: {
      height: 'var(--admin-topbar-h)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 14px',
      borderBottom: '1px solid var(--admin-border-color)',
      flex: 'none'
    }
  }, logo), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: '8px 0'
    }
  }, items.map((item, idx) => {
    if (item.type === 'divider') return /*#__PURE__*/React.createElement("div", {
      key: idx,
      style: {
        height: 1,
        background: 'var(--admin-border-color)',
        margin: '6px 10px'
      }
    });
    if (item.type === 'group') return /*#__PURE__*/React.createElement("div", {
      key: idx,
      style: {
        padding: '12px 14px 4px',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 'var(--admin-tracking-eyebrow)',
        textTransform: 'uppercase',
        color: 'var(--admin-text-subtle)'
      }
    }, item.label);
    const active = item.id === activeId;
    return /*#__PURE__*/React.createElement("button", {
      key: item.id,
      type: "button",
      "aria-current": active ? 'page' : undefined,
      onClick: () => onNavigate && onNavigate(item.id),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        height: 32,
        padding: '0 14px 0 12px',
        border: 'none',
        borderLeft: `3px solid ${active ? 'var(--admin-accent)' : 'transparent'}`,
        background: active ? 'var(--admin-selection-bg)' : 'transparent',
        color: active ? 'var(--admin-text)' : 'var(--admin-text-muted)',
        fontFamily: 'var(--admin-font-family)',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        textAlign: 'left'
      }
    }, item.icon && /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        alignItems: 'center',
        width: 16,
        flex: 'none',
        color: active ? 'var(--admin-accent)' : 'var(--admin-text-subtle)'
      }
    }, item.icon), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }
    }, item.label), item.badge != null && /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--admin-mono)',
        fontSize: 10,
        color: 'var(--admin-text-muted)',
        background: 'var(--admin-surface-sunken)',
        border: '1px solid var(--admin-border-color)',
        borderRadius: 9999,
        padding: '1px 6px'
      }
    }, item.badge));
  })), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: '1px solid var(--admin-border-color)',
      padding: 8
    }
  }, footer));
};

/* ---- Topbar ---- */
FA.Topbar = function Topbar({
  breadcrumb,
  actions,
  center,
  style
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      height: 'var(--admin-topbar-h)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '0 16px',
      background: 'var(--admin-surface)',
      borderBottom: 'var(--admin-border)',
      flex: 'none',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      alignItems: 'center'
    }
  }, breadcrumb), center && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      justifyContent: 'center'
    }
  }, center), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      flex: 'none'
    }
  }, actions));
};

/* ---- Breadcrumb ---- */
FA.Breadcrumb = function Breadcrumb({
  items = [],
  separator = '/',
  style
}) {
  return /*#__PURE__*/React.createElement("nav", {
    "aria-label": "Breadcrumb",
    style: {
      display: 'flex',
      alignItems: 'center',
      ...style
    }
  }, items.map((item, i) => {
    const last = i === items.length - 1;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: i
    }, i > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        margin: '0 6px',
        color: 'var(--admin-text-subtle)',
        fontFamily: 'var(--admin-mono)',
        fontSize: 12
      }
    }, separator), last ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: item.mono ? 'var(--admin-mono)' : 'inherit',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--admin-text)'
      }
    }, item.label) : /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: item.onClick,
      style: {
        fontFamily: item.mono ? 'var(--admin-mono)' : 'inherit',
        fontSize: 12,
        color: 'var(--admin-text-muted)',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: item.onClick ? 'pointer' : 'default'
      }
    }, item.label));
  }));
};

/* ---- Tabs ---- */
FA.Tabs = function Tabs({
  tabs = [],
  activeId,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    style: {
      display: 'flex',
      borderBottom: '1px solid var(--admin-border-color)',
      ...style
    }
  }, tabs.map(tab => {
    const active = tab.id === activeId;
    return /*#__PURE__*/React.createElement("button", {
      key: tab.id,
      role: "tab",
      "aria-selected": active,
      type: "button",
      onClick: () => onChange && onChange(tab.id),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: 36,
        padding: '0 14px',
        border: 'none',
        borderBottom: `2px solid ${active ? 'var(--admin-accent)' : 'transparent'}`,
        background: 'transparent',
        color: active ? 'var(--admin-text)' : 'var(--admin-text-muted)',
        fontFamily: 'var(--admin-font-family)',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        whiteSpace: 'nowrap'
      }
    }, tab.icon && /*#__PURE__*/React.createElement("span", null, tab.icon), tab.label, tab.count != null && /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--admin-mono)',
        fontSize: 10,
        color: active ? 'var(--admin-text-muted)' : 'var(--admin-text-subtle)',
        background: 'var(--admin-surface-sunken)',
        borderRadius: 9999,
        padding: '1px 5px',
        border: '1px solid var(--admin-border-color)'
      }
    }, tab.count));
  }));
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/familia_admin/components.jsx", error: String((e && e.message) || e) }); }

// ui_kits/familia_admin/data.js
try { (() => {
/* ui_kits/familia_admin/data.js
 * Hardcoded fixture data for the UI kit. Mirrors the sample JSON fixtures
 * from familia-admin/fixtures/.
 */
window.ADMIN_DATA = {
  models: [{
    model: 'customer',
    class: 'Customer',
    key_pattern: 'customer:{custid}:object',
    identifier_field: 'custid',
    fields: [{
      name: 'custid',
      category: 'field',
      persisted: true,
      identifier: true
    }, {
      name: 'email',
      category: 'field',
      persisted: true
    }, {
      name: 'name',
      category: 'field',
      persisted: true
    }, {
      name: 'status',
      category: 'field',
      persisted: true
    }, {
      name: 'created_at',
      category: 'field',
      persisted: true
    }, {
      name: 'updated_at',
      category: 'field',
      persisted: true
    }, {
      name: 'api_secret',
      category: 'encrypted',
      persisted: true,
      display: '[CONCEALED]'
    }, {
      name: 'password',
      category: 'transient',
      persisted: false,
      client_visible: false,
      display: '[REDACTED]'
    }],
    datatypes: [{
      name: 'recent_logins',
      type: 'list',
      scope: 'instance'
    }, {
      name: 'feature_flags',
      type: 'set',
      scope: 'instance'
    }, {
      name: 'domains',
      type: 'sorted_set',
      scope: 'instance'
    }, {
      name: 'metadata',
      type: 'hashkey',
      scope: 'instance'
    }, {
      name: 'login_count',
      type: 'counter',
      scope: 'instance'
    }],
    indexes: [{
      index_name: 'email_lookup',
      field: 'email',
      cardinality: 'unique',
      class_level: true,
      queryable: true,
      coordinate: 'Customer.email_lookup'
    }, {
      index_name: 'status_index',
      field: 'status',
      cardinality: 'multi',
      class_level: true,
      queryable: true,
      coordinate: 'Customer.status_index'
    }],
    expiration: {
      policy: 'ttl',
      default_seconds: 7776000
    },
    actions: ['list', 'read', 'create', 'update', 'destroy', 'reveal', 'rebuild_index']
  }, {
    model: 'session',
    class: 'Session',
    key_pattern: 'session:{sessid}:object',
    identifier_field: 'sessid',
    logical_database: 1,
    fields: [{
      name: 'sessid',
      category: 'field',
      persisted: true,
      identifier: true
    }, {
      name: 'custid',
      category: 'field',
      persisted: true
    }, {
      name: 'ip_address',
      category: 'field',
      persisted: true
    }, {
      name: 'user_agent',
      category: 'field',
      persisted: true
    }, {
      name: 'created_at',
      category: 'field',
      persisted: true
    }],
    datatypes: [],
    indexes: [],
    expiration: {
      policy: 'ttl',
      default_seconds: 86400
    },
    actions: ['list', 'read', 'create', 'update', 'destroy']
  }, {
    model: 'api_key',
    class: 'ApiKey',
    key_pattern: 'api_key:{keyid}:object',
    identifier_field: 'keyid',
    fields: [{
      name: 'keyid',
      category: 'field',
      persisted: true,
      identifier: true
    }, {
      name: 'custid',
      category: 'field',
      persisted: true
    }, {
      name: 'label',
      category: 'field',
      persisted: true
    }, {
      name: 'created_at',
      category: 'field',
      persisted: true
    }, {
      name: 'last_used_at',
      category: 'field',
      persisted: true
    }, {
      name: 'secret',
      category: 'encrypted',
      persisted: true,
      display: '[CONCEALED]'
    }],
    datatypes: [],
    indexes: [],
    participations: [{
      collection: 'api_keys',
      type: 'sorted_set',
      target: 'Customer',
      scored: true
    }],
    actions: ['list', 'read', 'create', 'update', 'destroy', 'reveal']
  }],
  records: {
    customer: [{
      custid: 'cust_8f2a91',
      email: 'alice@example.com',
      name: 'Alice Ng',
      status: 'active',
      created_at: 1730419200,
      updated_at: 1748736000,
      api_secret: '[CONCEALED]'
    }, {
      custid: 'cust_4410bd',
      email: 'bob@example.com',
      name: 'Bob Tran',
      status: 'pending',
      created_at: 1733011200,
      updated_at: 1733011200,
      api_secret: '[CONCEALED]'
    }, {
      custid: 'cust_2200ee',
      email: 'erin@example.com',
      name: 'Erin Diaz',
      status: 'inactive',
      created_at: 1727740800,
      updated_at: 1746057600,
      api_secret: '[CONCEALED]'
    }]
  },
  health: {
    healthy: false,
    model: 'Customer',
    checked_at: 1749200000,
    instances: {
      count_timeline: 1284,
      count_scan: 1282,
      phantoms: ['cust_legacy_01', 'cust_legacy_02'],
      missing: ['cust_9931']
    },
    unique_indexes: [{
      index_name: 'email_lookup',
      stale: ['bob@old.example'],
      missing: ['dana@example.com']
    }],
    multi_indexes: [{
      index_name: 'status_index',
      stale_members: ['cust_4410bd'],
      orphaned_keys: ['customer:status_index:archived']
    }],
    participations: [{
      collection_name: 'api_keys',
      stale_members: [{
        identifier: 'key_dead01',
        reason: 'record_missing'
      }]
    }],
    summary: {
      total_issues: 9,
      by_type: {
        phantoms: 2,
        missing: 1,
        stale_unique_index: 1,
        missing_unique_index: 1,
        stale_multi_member: 1,
        orphaned_index_key: 1,
        stale_participation: 1
      }
    }
  },
  migrations: {
    applied: [{
      id: '20260101_add_status_field',
      applied_at: 1735689600,
      description: 'Add status to Customer',
      reversible: true
    }, {
      id: '20260318_backfill_login_count',
      applied_at: 1742256000,
      description: 'Backfill Customer#login_count from events',
      reversible: false
    }],
    pending: [{
      id: '20260520_rename_fullname_to_name',
      description: 'Rename Customer#fullname → #name',
      reversible: true,
      dependencies: ['20260101_add_status_field']
    }, {
      id: '20260603_reencrypt_api_secret_v2',
      description: 'Re-encrypt Customer#api_secret v2',
      reversible: false,
      dependencies: []
    }],
    drift: [{
      model: 'Customer',
      changed: true,
      stored_digest: 'sha256:8a1c4e2f9b07d3a6',
      current_digest: 'sha256:91f4cc70ab12de58',
      differences: [{
        field: 'fullname',
        change: 'removed'
      }, {
        field: 'name',
        change: 'added'
      }, {
        field: 'updated_at',
        change: 'added'
      }],
      suggested_migration: '20260520_rename_fullname_to_name'
    }, {
      model: 'Session',
      changed: false,
      stored_digest: 'sha256:55de1188aa0c2f31',
      current_digest: 'sha256:55de1188aa0c2f31',
      differences: []
    }]
  },
  repairStream: [{
    event: 'start',
    model: 'Customer',
    dry_run: false,
    at: 1749200200
  }, {
    phase: 'instances',
    current: 1284,
    total: 1284,
    result: {
      phantoms_removed: 2,
      missing_added: 1
    }
  }, {
    phase: 'unique_indexes',
    current: 1,
    total: 1,
    index: 'email_lookup',
    result: {
      rebuilt: 1
    }
  }, {
    phase: 'multi_indexes',
    current: 1,
    total: 1,
    index: 'status_index',
    result: {
      stale_members_removed: 1,
      orphaned_keys_removed: 1
    }
  }, {
    phase: 'participations',
    current: 1,
    total: 1,
    collection: 'api_keys',
    result: {
      stale_removed: 1
    }
  }, {
    event: 'done',
    healthy: true,
    at: 1749200214,
    summary: {
      phantoms_removed: 2,
      missing_added: 1,
      indexes_rebuilt: 2,
      stale_members_removed: 2
    }
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/familia_admin/data.js", error: String((e && e.message) || e) }); }

// ui_kits/familia_admin/icons.js
try { (() => {
/* Icons used across the UI kit — all Lucide-style, 14px, 1.4px stroke */
(function () {
  const s = d => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('width', '14');
    el.setAttribute('height', '14');
    el.setAttribute('viewBox', '0 0 14 14');
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'currentColor');
    el.setAttribute('stroke-width', '1.4');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    el.innerHTML = d;
    return el;
  };
  window.Icons = {
    table: () => React.createElement('svg', {
      width: 14,
      height: 14,
      viewBox: '0 0 14 14',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    }, React.createElement('rect', {
      x: 1,
      y: 1,
      width: 12,
      height: 12,
      rx: 1
    }), React.createElement('line', {
      x1: 1,
      y1: 5,
      x2: 13,
      y2: 5
    }), React.createElement('line', {
      x1: 5,
      y1: 5,
      x2: 5,
      y2: 13
    })),
    shield: () => React.createElement('svg', {
      width: 14,
      height: 14,
      viewBox: '0 0 14 14',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    }, React.createElement('path', {
      d: 'M7 1L2 3.5v4C2 10.5 7 13 7 13s5-2.5 5-5.5v-4L7 1z'
    })),
    layers: () => React.createElement('svg', {
      width: 14,
      height: 14,
      viewBox: '0 0 14 14',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    }, React.createElement('polygon', {
      points: '7,1 13,5 7,9 1,5'
    }), React.createElement('polyline', {
      points: '1,9 7,13 13,9'
    })),
    terminal: () => React.createElement('svg', {
      width: 14,
      height: 14,
      viewBox: '0 0 14 14',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    }, React.createElement('polyline', {
      points: '2,4 6,7 2,10'
    }), React.createElement('line', {
      x1: 7,
      y1: 10,
      x2: 12,
      y2: 10
    })),
    key: () => React.createElement('svg', {
      width: 14,
      height: 14,
      viewBox: '0 0 14 14',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    }, React.createElement('circle', {
      cx: 5,
      cy: 5,
      r: 3
    }), React.createElement('path', {
      d: 'M7 7l5 5M9 11l2 2'
    })),
    search: () => React.createElement('svg', {
      width: 14,
      height: 14,
      viewBox: '0 0 14 14',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    }, React.createElement('circle', {
      cx: 6,
      cy: 6,
      r: 4.5
    }), React.createElement('line', {
      x1: 9.5,
      y1: 9.5,
      x2: 13,
      y2: 13
    })),
    sun: () => React.createElement('svg', {
      width: 14,
      height: 14,
      viewBox: '0 0 14 14',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round'
    }, React.createElement('circle', {
      cx: 7,
      cy: 7,
      r: 2.5
    }), React.createElement('line', {
      x1: 7,
      y1: 1,
      x2: 7,
      y2: 2
    }), React.createElement('line', {
      x1: 7,
      y1: 12,
      x2: 7,
      y2: 13
    }), React.createElement('line', {
      x1: 1,
      y1: 7,
      x2: 2,
      y2: 7
    }), React.createElement('line', {
      x1: 12,
      y1: 7,
      x2: 13,
      y2: 7
    })),
    moon: () => React.createElement('svg', {
      width: 14,
      height: 14,
      viewBox: '0 0 14 14',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round'
    }, React.createElement('path', {
      d: 'M12 8A5 5 0 016 2a7 7 0 100 10 5 5 0 016-4z'
    })),
    chevron: () => React.createElement('svg', {
      width: 12,
      height: 12,
      viewBox: '0 0 12 12',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round'
    }, React.createElement('path', {
      d: 'M3 5l3 3 3-3'
    })),
    external: () => React.createElement('svg', {
      width: 12,
      height: 12,
      viewBox: '0 0 12 12',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    }, React.createElement('path', {
      d: 'M5 2H2v8h8V7M7 2h3v3M10 2L6 6'
    })),
    plus: () => React.createElement('svg', {
      width: 12,
      height: 12,
      viewBox: '0 0 12 12',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round'
    }, React.createElement('line', {
      x1: 6,
      y1: 2,
      x2: 6,
      y2: 10
    }), React.createElement('line', {
      x1: 2,
      y1: 6,
      x2: 10,
      y2: 6
    })),
    refresh: () => React.createElement('svg', {
      width: 14,
      height: 14,
      viewBox: '0 0 14 14',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    }, React.createElement('path', {
      d: 'M12 4A6 6 0 102 7'
    }), React.createElement('polyline', {
      points: '12,1 12,4 9,4'
    })),
    eye: () => React.createElement('svg', {
      width: 14,
      height: 14,
      viewBox: '0 0 14 14',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round'
    }, React.createElement('path', {
      d: 'M1 7s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z'
    }), React.createElement('circle', {
      cx: 7,
      cy: 7,
      r: 1.5
    })),
    check: () => React.createElement('svg', {
      width: 14,
      height: 14,
      viewBox: '0 0 14 14',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    }, React.createElement('polyline', {
      points: '2,7 5.5,10.5 12,4'
    }))
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/familia_admin/icons.js", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Kbd = __ds_scope.Kbd;

__ds_ns.Mono = __ds_scope.Mono;

__ds_ns.StatusDot = __ds_scope.StatusDot;

__ds_ns.CountPair = __ds_scope.CountPair;

__ds_ns.DataTable = __ds_scope.DataTable;

__ds_ns.FieldChip = __ds_scope.FieldChip;

__ds_ns.KeyValue = __ds_scope.KeyValue;

__ds_ns.Banner = __ds_scope.Banner;

__ds_ns.DryRunConfirm = __ds_scope.DryRunConfirm;

__ds_ns.ProgressStream = __ds_scope.ProgressStream;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Breadcrumb = __ds_scope.Breadcrumb;

__ds_ns.Sidebar = __ds_scope.Sidebar;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Topbar = __ds_scope.Topbar;

})();
