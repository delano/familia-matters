/* explorer/RawExplorer.jsx — the primary screen. Left key-search pane + right
 * typed inspector / server info / live feed, with a command console pinned at
 * the bottom. Everything reads from the ONE shared backend via window.XSTORE and
 * degrades to the window.RAW seed when it is unreachable. The "Preview" switcher
 * routes to the eight review states through the same live calls.
 * Exports window.RawExplorer. Props: { state, setState }. */
const RX_DS = window.FamiliaAdminDesignSystem_a9098d;
const { Tabs: RXTabs, StatusDot: RXDot, Badge: RXBadge } = RX_DS;
const RXI = window.XICONS;
const { KeySearch, Inspector } = window.XBROWSER;
const { ServerInfo, LiveFeed, CommandConsole } = window.XCONSOLE;
const RAWD = window.RAW;
const XST = window.XSTORE;

const SAMPLE_CMD = 'HGETALL customer:cust_8f2a91:object';
const BLOCK_CMD = 'KEYS *';

function RawExplorer({ state, setState, offline, onOfflineChange }) {
  // key search
  const [pattern, setPattern] = React.useState('customer:*');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [keys, setKeys] = React.useState([]);
  const [cursor, setCursor] = React.useState(0);
  const [scanned, setScanned] = React.useState(null);
  const [matched, setMatched] = React.useState(null);
  const [scanBusy, setScanBusy] = React.useState(false);

  // inspector
  const [selectedKey, setSelectedKey] = React.useState(null);
  const [inspectData, setInspectData] = React.useState(null);
  const [inspectBusy, setInspectBusy] = React.useState(false);

  // right tab
  const [rightTab, setRightTab] = React.useState('inspector');

  // server info
  const [info, setInfo] = React.useState(null);
  const [infoBusy, setInfoBusy] = React.useState(false);
  const [infoOffline, setInfoOffline] = React.useState(false);

  // live feed
  const [feed, setFeed] = React.useState([]);
  const [feedRunning, setFeedRunning] = React.useState(false);

  // command console
  const [cmdInput, setCmdInput] = React.useState('');
  const [history, setHistory] = React.useState([]);
  const [cmdBusy, setCmdBusy] = React.useState(false);
  const [tierHeld, setTierHeld] = React.useState(false);

  const intentRef = React.useRef('idle');
  const tierRef = React.useRef(false);
  const feedClock = React.useRef(65900); // seconds since midnight ~ 18:18:20
  const feedSeq = React.useRef(0);
  React.useEffect(() => { tierRef.current = tierHeld; }, [tierHeld]);

  const go = (next) => { intentRef.current = next; setState(next); };

  // ── scan ─────────────────────────────────────────────────────────────────
  async function doScan(reset, pat, type) {
    setScanBusy(true);
    const useCursor = reset ? 0 : cursor;
    const res = await XST.scan(pat != null ? pat : pattern, type != null ? type : typeFilter, useCursor);
    setScanBusy(false);
    onOfflineChange(res.offline);
    setScanned(res.scanned); setMatched(res.matched);
    setCursor(res.cursor || 0);
    setKeys((prev) => reset ? res.keys : prev.concat(res.keys));
    return res;
  }
  const onScan = () => { doScan(true); go('results'); };
  const onMore = () => { doScan(false); };

  // ── inspect ──────────────────────────────────────────────────────────────
  async function selectKey(key) {
    setSelectedKey(key); setRightTab('inspector'); setInspectBusy(true);
    const res = await XST.inspect(key);
    setInspectBusy(false);
    onOfflineChange(res.offline || offline);
    setInspectData(res);
    go('selected');
  }

  // ── info ─────────────────────────────────────────────────────────────────
  async function loadInfo() {
    setInfoBusy(true);
    const res = await XST.info();
    setInfoBusy(false);
    setInfo(res.sections); setInfoOffline(res.offline);
  }

  // ── feed ─────────────────────────────────────────────────────────────────
  const clockStr = (secs) => {
    const s = ((secs % 86400) + 86400) % 86400;
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(Math.floor(s % 60)).padStart(2, '0');
    return `${h}:${m}:${ss}`;
  };
  function pushFeedEvent() {
    const sample = RAWD.FEED_SAMPLES[Math.floor(Math.random() * RAWD.FEED_SAMPLES.length)];
    feedClock.current += 1 + Math.floor(Math.random() * 3);
    feedSeq.current += 1;
    const jitter = (Math.random() - 0.5) * 0.6;
    const evt = { ...sample, duration_ms: Math.max(0.1, sample.duration_ms + jitter), clock: clockStr(feedClock.current), _id: feedSeq.current };
    setFeed((prev) => [evt, ...prev].slice(0, 80));
  }
  React.useEffect(() => {
    if (!feedRunning) return;
    if (feed.length === 0) { for (let i = 0; i < 6; i++) pushFeedEvent(); }
    const t = setInterval(pushFeedEvent, 1100);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [feedRunning]);

  // ── command console ───────────────────────────────────────────────────────
  function pushHistory(entry) { setHistory((h) => [...h, entry]); }
  function forceLine(line) {
    if (!tierRef.current) { pushHistory({ kind: 'noperm', cmd: (line.split(/\s+/)[0] || '').toUpperCase(), required: XST.RAWCMD }); go('noperm'); return; }
    const r = RAWD.runCommandLocal(line, XST.RAWCMD, true);
    pushHistory({ kind: 'forced', cmd: r.cmd, args: r.args, result: r.result, simulated: true });
    go('command');
  }
  async function runLine(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return;
    setCmdBusy(true);
    const res = await XST.command(trimmed, { force: false });
    setCmdBusy(false);
    onOfflineChange(res.offline || offline);
    if (res.empty) return;
    if (res.blocked) {
      pushHistory({ kind: 'blocked', cmd: res.cmd, reason: res.reason, required_tier: res.required_tier, onForce: () => forceLine(trimmed) });
      go('blocked');
    } else if (res.unknown) {
      pushHistory({ kind: 'unknown', cmd: res.cmd });
      go('command');
    } else {
      pushHistory({ kind: 'result', cmd: res.cmd, args: res.args, result: res.result, simulated: res.simulated });
      go('command');
    }
  }
  const onRun = () => { const v = cmdInput; setCmdInput(''); runLine(v); };

  // ── model bridge ──────────────────────────────────────────────────────────
  const EMBEDDED = window.parent !== window;
  function openModel(model, id) {
    if (EMBEDDED) window.parent.postMessage({ type: 'familia-nav', screen: model === 'api_key' ? 'models' : 'records', recordId: id }, '*');
    else window.location.href = model === 'api_key' ? 'Models.html' : 'Customer Records.html';
  }

  // ── scenario routing ──────────────────────────────────────────────────────
  function enterScenario(target) {
    if (target === 'idle') {
      setKeys([]); setSelectedKey(null); setInspectData(null); setScanned(null); setMatched(null); setCursor(0); setRightTab('inspector'); setFeedRunning(false);
    } else if (target === 'results') {
      setRightTab('inspector'); doScan(true, 'customer:*', 'all');
    } else if (target === 'selected') {
      doScan(true, 'customer:*', 'all').then(() => selectKey('customer:cust_8f2a91:object'));
    } else if (target === 'info') {
      setRightTab('info'); if (!info) loadInfo();
    } else if (target === 'feed') {
      setRightTab('feed'); setFeedRunning(true);
    } else if (target === 'command') {
      runLine(SAMPLE_CMD);
    } else if (target === 'blocked') {
      setTierHeld(false); runLine(BLOCK_CMD);
    } else if (target === 'noperm') {
      setTierHeld(false);
      pushHistory({ kind: 'blocked', cmd: 'FLUSHDB', reason: RAWD.BLOCK.FLUSHDB, required_tier: XST.RAWCMD, onForce: () => forceLine('FLUSHDB') });
      pushHistory({ kind: 'noperm', cmd: 'FLUSHDB', required: XST.RAWCMD });
    }
  }
  React.useEffect(() => {
    if (intentRef.current === state) return;
    intentRef.current = state;
    enterScenario(state);
    // eslint-disable-next-line
  }, [state]);

  // ── header status ─────────────────────────────────────────────────────────
  const statusMap = {
    idle: { status: 'caution', label: 'Idle' },
    results: { status: 'healthy', label: `${matched != null ? matched : keys.length} keys` },
    selected: { status: 'preview', label: 'Key selected' },
    info: { status: 'healthy', label: 'Server info' },
    feed: { status: feedRunning ? 'healthy' : 'caution', label: feedRunning ? 'Feed streaming' : 'Feed paused' },
    command: { status: 'healthy', label: 'Command run' },
    blocked: { status: 'broken', label: 'Command blocked' },
    noperm: { status: 'caution', label: 'Read-only' },
  }[state] || { status: 'caution', label: 'Idle' };

  const tabs = [
    { id: 'inspector', label: 'Inspector', icon: <RXI.key size={13} /> },
    { id: 'info', label: 'Server info', icon: <RXI.server size={13} /> },
    { id: 'feed', label: 'Live feed', icon: <RXI.activity size={13} />, count: feed.length || undefined },
  ];
  const switchTab = (id) => {
    setRightTab(id);
    if (id === 'info') { if (!info) loadInfo(); go('info'); }
    else if (id === 'feed') { setFeedRunning(true); go('feed'); }
    else go(selectedKey ? 'selected' : 'idle');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--admin-border-color)', flex: 'none' }}>
        <span style={{ color: 'var(--admin-accent)', display: 'flex' }}><RXI.terminal size={18} /></span>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>Raw explorer</h1>
        <span style={{ whiteSpace: 'nowrap' }}><RXDot status={statusMap.status} label={statusMap.label} /></span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--admin-mono)', fontSize: 11, color: 'var(--admin-text-subtle)', whiteSpace: 'nowrap' }}>valkey 8.0 · db0 · db1 · db3</span>
      </div>

      {/* Main: search | right pane */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '360px 1fr' }}>
        <KeySearch
          pattern={pattern} setPattern={setPattern} typeFilter={typeFilter} setTypeFilter={setTypeFilter}
          keys={keys} cursor={cursor} scanned={scanned} matched={matched} busy={scanBusy} offline={offline}
          selectedKey={selectedKey} onScan={onScan} onMore={onMore} onSelect={selectKey}
        />
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 'none', padding: '0 16px', borderBottom: '1px solid var(--admin-border-color)' }}>
            <RXTabs tabs={tabs} activeId={rightTab} onChange={switchTab} style={{ border: 'none' }} />
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {rightTab === 'inspector' && <Inspector data={inspectData} busy={inspectBusy} onOpenModel={openModel} />}
            {rightTab === 'info' && <ServerInfo sections={info || RAWD.INFO} offline={infoOffline} busy={infoBusy} onRefresh={loadInfo} />}
            {rightTab === 'feed' && <LiveFeed events={feed} running={feedRunning} onToggle={() => setFeedRunning((r) => !r)} onClear={() => setFeed([])} slowMs={RAWD.SLOW_MS} />}
          </div>
        </div>
      </div>

      {/* Command console */}
      <CommandConsole
        history={history} input={cmdInput} setInput={setCmdInput} busy={cmdBusy}
        onRun={onRun} tierHeld={tierHeld} onToggleTier={(v) => setTierHeld(v)}
      />
    </div>
  );
}

window.RawExplorer = RawExplorer;
