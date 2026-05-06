/**
 * ClearChain Extension v3 — Popup Script
 * Features: Scan, Bulk scan, History, Watchlist, Copy formats, Cache indicator
 */

const API_BASE = 'https://clearchain.vercel.app';
const CACHE_TTL = 60 * 60 * 1000;

const SIGNAL_LABELS = {
  ofac_match:             'OFAC match',
  mixer_interaction:      'Mixer interaction',
  rapid_fund_movement:    'Rapid movement',
  high_risk_counterparty: 'High-risk counterparty',
  volume_anomaly:         'Volume anomaly',
  community_flags:        'Community flags',
  coinjoin_usage:         'CoinJoin usage',
  peel_chain:             'Peel chain',
  coinbase_recipient:     'Coinbase recipient',
};

const SCAN_STAGES = [
  { label: 'FETCHING TRANSACTIONS...', pct: 15 },
  { label: 'CHECKING OFAC SANCTIONS...', pct: 35 },
  { label: 'COMPUTING RISK SCORE...', pct: 60 },
  { label: 'MATCHING AML TYPOLOGIES...', pct: 78 },
  { label: 'GENERATING AI ASSESSMENT...', pct: 92 },
  { label: 'FINALIZING REPORT...', pct: 100 },
];

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const addressInput     = $('address-input');
const chainBadge       = $('chain-badge');
const pageWalletBadge  = $('page-wallet-badge');
const scanBtn          = $('scan-btn');
const scanLabel        = $('scan-label');
const scanSpinner      = $('scan-spinner');
const pasteBtn         = $('paste-btn');
const clearInputBtn    = $('clear-input-btn');
const scanProgress     = $('scan-progress');
const progressBar      = $('progress-bar');
const progressLabel    = $('progress-label');
const emptyState       = $('empty-state');
const results          = $('results');
const errorState       = $('error-state');
const errorMsg         = $('error-msg');
const retryBtn         = $('retry-btn');
const historyList      = $('history-list');
const historyEmpty     = $('history-empty');
const historyFooter    = $('history-footer');
const historyCount     = $('history-count');
const clearHistBtn     = $('clear-history-btn');
const toast            = $('toast');
const cacheIndicator   = $('cache-indicator');
// Watchlist
const watchlistInput      = $('watchlist-input');
const watchlistAddConfirm = $('watchlist-add-confirm');
const watchlistList       = $('watchlist-list');
const watchlistEmpty      = $('watchlist-empty');
const watchlistFooter     = $('watchlist-footer');
const watchlistCount      = $('watchlist-count');
const checkAllBtn         = $('check-all-btn');
const clearWatchlistBtn   = $('clear-watchlist-btn');
// Bulk
const bulkInput    = $('bulk-input');
const bulkScanBtn  = $('bulk-scan-btn');
const bulkLabel    = $('bulk-label');
const bulkSpinner  = $('bulk-spinner');
const bulkResults  = $('bulk-results');

let lastResult = null;
let detectedChain = null;
let stageTimer = null;

// ── Chain detection ───────────────────────────────────────────────────────────
function detectChain(addr) {
  const a = addr.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(a) || /\.eth$/.test(a)) return 'ETH';
  if (/^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a) || /^bc1[a-z0-9]{39,59}$/.test(a)) return 'BTC';
  if (/^T[a-zA-Z0-9]{33}$/.test(a)) return 'TRX';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return 'SOL';
  return null;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    tab.classList.add('active');
    $(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    if (tab.dataset.tab === 'history') loadHistory();
    if (tab.dataset.tab === 'watchlist') loadWatchlist();
  });
});

// ── Mode toggle (single / bulk) ───────────────────────────────────────────────
$('mode-single-btn').addEventListener('click', () => {
  $('mode-single-btn').classList.add('active');
  $('mode-bulk-btn').classList.remove('active');
  $('single-mode').classList.remove('hidden');
  $('bulk-mode').classList.add('hidden');
  $('scan-progress').classList.add('hidden');
  hideAllStates();
  emptyState.classList.remove('hidden');
});

$('mode-bulk-btn').addEventListener('click', () => {
  $('mode-bulk-btn').classList.add('active');
  $('mode-single-btn').classList.remove('active');
  $('bulk-mode').classList.remove('hidden');
  $('single-mode').classList.add('hidden');
  $('scan-progress').classList.add('hidden');
  hideAllStates();
  bulkResults.classList.add('hidden');
});

// ── Input handling ─────────────────────────────────────────────────────────────
addressInput.addEventListener('input', onInputChange);

function onInputChange() {
  const val = addressInput.value.trim();
  clearInputBtn.classList.toggle('hidden', val.length === 0);
  detectedChain = detectChain(val);
  if (detectedChain) {
    chainBadge.textContent = detectedChain;
    chainBadge.classList.remove('hidden');
  } else {
    chainBadge.classList.add('hidden');
  }
  scanBtn.disabled = val.length < 10;
}

addressInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !scanBtn.disabled) triggerScan();
});

clearInputBtn.addEventListener('click', () => {
  addressInput.value = '';
  onInputChange();
  showEmpty();
  addressInput.focus();
});

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      addressInput.value = text.trim();
      onInputChange();
      if (detectedChain && !scanBtn.disabled) triggerScan();
    }
  } catch {
    showToast('Clipboard access denied');
  }
});

// ── Single Scan ───────────────────────────────────────────────────────────────
scanBtn.addEventListener('click', triggerScan);
retryBtn.addEventListener('click', triggerScan);

async function triggerScan() {
  const address = addressInput.value.trim();
  if (!address) return;
  const chain = detectedChain || 'ETH';

  setScanning(true);
  hideAllStates();
  showProgress();
  startProgressAnimation();

  try {
    const { result, fromCache, cachedAt } = await analyzeAddress(address, chain);
    lastResult = result;
    stopProgressAnimation(true);
    setTimeout(() => renderResult(result, fromCache, cachedAt), 300);
  } catch (err) {
    stopProgressAnimation(false);
    showError(err.message || 'Could not complete analysis. Please try again.');
  } finally {
    setScanning(false);
  }
}

function setScanning(on) {
  scanBtn.disabled = on;
  scanLabel.classList.toggle('hidden', on);
  scanSpinner.classList.toggle('hidden', !on);
}

// ── Bulk Scan ─────────────────────────────────────────────────────────────────
bulkScanBtn.addEventListener('click', async () => {
  const lines = bulkInput.value
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 5)
    .slice(0, 10);

  if (!lines.length) { showToast('Enter at least one address'); return; }

  bulkLabel.classList.add('hidden');
  bulkSpinner.classList.remove('hidden');
  bulkScanBtn.disabled = true;
  bulkResults.innerHTML = '';
  bulkResults.classList.remove('hidden');

  // Build skeleton rows
  for (const addr of lines) {
    const chain = detectChain(addr) || 'ETH';
    const short = addr.length > 18 ? addr.slice(0, 8) + '…' + addr.slice(-6) : addr;
    const row = document.createElement('div');
    row.className = 'bulk-row';
    row.id = `bulk-row-${addr.slice(0, 12)}`;
    row.innerHTML = `
      <div class="bulk-addr" title="${addr}">${short}</div>
      <div class="bulk-chain">${chain}</div>
      <div class="bulk-score pending">···</div>
      <div class="bulk-level">—</div>
    `;
    bulkResults.appendChild(row);
  }

  // Scan each with small delay between calls
  for (const addr of lines) {
    const chain = detectChain(addr) || 'ETH';
    const rowId = `bulk-row-${addr.slice(0, 12)}`;
    const row = document.getElementById(rowId);
    try {
      const { result } = await analyzeAddress(addr, chain);
      const level = (result.riskLevel || 'LOW').toLowerCase();
      row.querySelector('.bulk-score').textContent = result.riskScore;
      row.querySelector('.bulk-score').className = `bulk-score ${level}`;
      row.querySelector('.bulk-level').textContent = result.riskLevel;
      row.querySelector('.bulk-level').className = `bulk-level ${level}`;
      // Click to view full result
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        $('mode-single-btn').click();
        addressInput.value = addr;
        onInputChange();
        lastResult = result;
        hideAllStates();
        renderResult(result, false, null);
      });
    } catch {
      row.querySelector('.bulk-score').textContent = 'ERR';
      row.querySelector('.bulk-score').className = 'bulk-score critical';
    }
    await new Promise(r => setTimeout(r, 200)); // small rate-limit buffer
  }

  bulkLabel.classList.remove('hidden');
  bulkSpinner.classList.add('hidden');
  bulkScanBtn.disabled = false;
});

// ── Progress animation ─────────────────────────────────────────────────────────
function showProgress() {
  scanProgress.classList.remove('hidden');
  progressBar.style.width = '0%';
  progressLabel.textContent = 'INITIALIZING...';
}

function startProgressAnimation() {
  let stageIdx = 0;
  clearTimeout(stageTimer);
  function next() {
    if (stageIdx >= SCAN_STAGES.length) return;
    const s = SCAN_STAGES[stageIdx++];
    progressBar.style.width = s.pct + '%';
    progressLabel.textContent = s.label;
    if (stageIdx < SCAN_STAGES.length) {
      stageTimer = setTimeout(next, 400 + Math.random() * 300);
    }
  }
  next();
}

function stopProgressAnimation(success) {
  clearTimeout(stageTimer);
  if (success) {
    progressBar.style.width = '100%';
    progressLabel.textContent = 'COMPLETE';
  } else {
    progressLabel.textContent = 'ERROR';
  }
  setTimeout(() => scanProgress.classList.add('hidden'), 500);
}

// ── API call (with cache age tracking) ────────────────────────────────────────
async function analyzeAddress(address, chain) {
  const cacheKey = `cc_cache_${chain}:${address}`;

  try {
    const stored = await chrome.storage.local.get(cacheKey);
    const cached = stored[cacheKey];
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
      return { result: cached.result, fromCache: true, cachedAt: cached.cachedAt };
    }
  } catch (_) {}

  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, chain }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }

  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Analysis failed');

  const result = {
    address:     json.resolvedAddress || address,
    chain,
    riskScore:   json.data.riskScore.total,
    riskLevel:   json.data.riskScore.level,
    signals:     json.data.riskScore.signals,
    typologies:  json.data.typologies || [],
    ofacMatched: json.data.ofacResult?.matched || false,
    ofacEntity:  json.data.ofacResult?.matchedEntity || null,
    narrative:   json.narrative || '',
    analyzedAt:  json.data.analyzedAt,
    txCount:     json.data.transactions?.length || 0,
  };

  const now = Date.now();
  try {
    await chrome.storage.local.set({ [cacheKey]: { result, cachedAt: now } });
    await saveToHistory(result);
  } catch (_) {}

  // Notify content script to update inline badges
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'RISK_UPDATE',
        address: result.address,
        riskLevel: result.riskLevel,
      }).catch(() => {});
    }
  } catch (_) {}

  return { result, fromCache: false, cachedAt: now };
}

// ── Render result ──────────────────────────────────────────────────────────────
function renderResult(result, fromCache, cachedAt) {
  const level = (result.riskLevel || 'LOW').toLowerCase();
  const score = result.riskScore || 0;

  // Cache indicator
  if (fromCache && cachedAt) {
    const mins = Math.round((Date.now() - cachedAt) / 60000);
    cacheIndicator.textContent = `cached · ${mins < 1 ? '<1' : mins}m ago`;
    cacheIndicator.className = 'cache-indicator cached';
  } else {
    cacheIndicator.textContent = 'live data';
    cacheIndicator.className = 'cache-indicator live';
  }

  // Gauge
  animateGauge(score, level);
  $('risk-level-text').textContent = result.riskLevel;
  $('risk-level-text').className = `risk-level-text ${level}`;
  $('ofac-pill').classList.toggle('hidden', !result.ofacMatched);
  $('result-chain').textContent = `${result.chain} NETWORK`;

  // Stats
  const signals = result.signals || {};
  const triggered = Object.values(signals).filter(s => s.triggered).length;
  const total     = Object.values(signals).filter(s => s.weight > 0).length;
  const triggeredTypos = (result.typologies || []).filter(t => t.triggered).length;
  $('stat-signals').textContent    = `${triggered}/${total}`;
  $('stat-typologies').textContent = triggeredTypos > 0 ? triggeredTypos : '0';
  $('stat-txs').textContent        = result.txCount > 0 ? result.txCount : '—';

  // Signals
  const signalsList = $('signals-list');
  signalsList.innerHTML = '';
  const entries = Object.entries(signals).sort((a, b) => b[1].score - a[1].score);
  for (const [key, sig] of entries) {
    if (sig.weight === 0 && !sig.triggered) continue;
    const row = document.createElement('div');
    row.className = `signal-row${sig.triggered ? ' triggered' : ''}`;
    row.innerHTML = `
      <div class="sig-left">
        <div class="sig-dot"></div>
        <div class="sig-name">${SIGNAL_LABELS[key] || key.replace(/_/g, ' ')}</div>
      </div>
      <div class="sig-score">${sig.triggered ? '+' + sig.score : '0'}/${sig.weight}</div>
    `;
    signalsList.appendChild(row);
  }

  $('signals-toggle').onclick = () => {
    signalsList.classList.toggle('hidden');
    $('signals-toggle').textContent = signalsList.classList.contains('hidden') ? '▸' : '▾';
  };

  // Typologies
  const typosWrap = $('typologies-wrap');
  const typosList = $('typologies-list');
  const triggeredTypologies = (result.typologies || []).filter(t => t.triggered);
  if (triggeredTypologies.length > 0) {
    typosList.innerHTML = '';
    for (const t of triggeredTypologies) {
      const row = document.createElement('div');
      row.className = 'typo-row';
      row.innerHTML = `
        <div class="typo-name">${t.name || t.id || 'Pattern'}</div>
        <div class="typo-conf">${Math.round((t.confidence || 0) * 100)}%</div>
      `;
      typosList.appendChild(row);
    }
    typosWrap.classList.remove('hidden');
  } else {
    typosWrap.classList.add('hidden');
  }

  // Narrative snippet (first 2 sentences)
  const narrativeWrap = $('narrative-wrap');
  const narrativeText = $('narrative-text');
  if (result.narrative && result.narrative.length > 20) {
    const sentences = result.narrative.split(/(?<=[.!?])\s+/);
    narrativeText.textContent = sentences.slice(0, 2).join(' ');
    narrativeWrap.classList.remove('hidden');
  } else {
    narrativeWrap.classList.add('hidden');
  }

  // Full report link
  const encoded = encodeURIComponent(result.address);
  $('full-report-link').href = `${API_BASE}/?address=${encoded}&chain=${result.chain}`;

  // Timestamp
  if (result.analyzedAt) {
    const d = new Date(result.analyzedAt);
    $('scan-timestamp').textContent = `SCANNED ${d.toUTCString().replace(' GMT', ' UTC')}`;
  }

  updateHistoryBadge();
  updateWatchlistBadge();
  results.classList.remove('hidden');
}

// ── Gauge animation ────────────────────────────────────────────────────────────
function animateGauge(score, level) {
  const fill    = document.getElementById('gauge-fill');
  const scoreEl = document.getElementById('gauge-score');
  const COLORS  = { clean: '#00ff88', low: '#00ff88', medium: '#ffd60a', high: '#ff8c00', critical: '#ff3b3b' };
  const color   = COLORS[level] || '#06b6d4';
  const total   = 251.2;

  fill.style.stroke = color;
  fill.style.strokeDashoffset = total;
  scoreEl.style.fill = color;

  let current = 0;
  const step = Math.max(1, Math.floor(score / 30));
  const interval = setInterval(() => {
    current = Math.min(current + step, score);
    scoreEl.textContent = current;
    fill.style.strokeDashoffset = total - (current / 100) * total;
    if (current >= score) clearInterval(interval);
  }, 30);
}

// ── History ────────────────────────────────────────────────────────────────────
async function saveToHistory(result) {
  const stored = await chrome.storage.local.get('cc_history');
  const history = stored.cc_history || [];
  const filtered = history.filter(h => !(h.address === result.address && h.chain === result.chain));
  const updated = [{ ...result, scannedAt: Date.now() }, ...filtered].slice(0, 20);
  await chrome.storage.local.set({ cc_history: updated });
}

async function loadHistory() {
  const stored = await chrome.storage.local.get('cc_history');
  const history = stored.cc_history || [];

  historyList.innerHTML = '';
  if (history.length === 0) {
    historyEmpty.classList.remove('hidden');
    historyFooter.classList.add('hidden');
  } else {
    historyEmpty.classList.add('hidden');
    historyFooter.classList.remove('hidden');
    for (const item of history) {
      const row = document.createElement('div');
      row.className = 'hist-item';
      const level = (item.riskLevel || 'LOW').toLowerCase();
      const shortAddr = item.address.length > 20
        ? item.address.slice(0, 8) + '...' + item.address.slice(-6)
        : item.address;
      const ago = timeAgo(item.scannedAt);
      row.innerHTML = `
        <div class="hist-left">
          <div class="hist-addr" title="${item.address}">${shortAddr}</div>
          <div class="hist-chain">${item.chain} · ${ago}</div>
        </div>
        <div class="hist-right">
          <div class="hist-score ${level}">${item.riskScore}</div>
          <div class="hist-level">${item.riskLevel}</div>
        </div>
      `;
      row.addEventListener('click', () => {
        document.querySelector('[data-tab="scan"]').click();
        addressInput.value = item.address;
        onInputChange();
        lastResult = item;
        hideAllStates();
        renderResult(item, false, null);
      });
      historyList.appendChild(row);
    }
  }
}

async function updateHistoryBadge() {
  const stored = await chrome.storage.local.get('cc_history');
  const count = (stored.cc_history || []).length;
  if (count > 0) {
    historyCount.textContent = count;
    historyCount.classList.remove('hidden');
  } else {
    historyCount.classList.add('hidden');
  }
}

clearHistBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove('cc_history');
  loadHistory();
  updateHistoryBadge();
  showToast('History cleared');
});

// ── Watchlist ──────────────────────────────────────────────────────────────────
async function getWatchlist() {
  const stored = await chrome.storage.local.get('cc_watchlist');
  return stored.cc_watchlist || [];
}

async function saveWatchlist(list) {
  await chrome.storage.local.set({ cc_watchlist: list });
  updateWatchlistBadge();
}

async function loadWatchlist() {
  const list = await getWatchlist();
  watchlistList.innerHTML = '';

  if (list.length === 0) {
    watchlistEmpty.classList.remove('hidden');
    watchlistFooter.classList.add('hidden');
  } else {
    watchlistEmpty.classList.add('hidden');
    watchlistFooter.classList.remove('hidden');
    for (const item of list) {
      watchlistList.appendChild(buildWatchlistRow(item));
    }
  }
}

function buildWatchlistRow(item) {
  const row = document.createElement('div');
  row.className = 'watchlist-row';
  row.id = `wl-${item.address.slice(0, 12)}`;
  const level  = item.riskLevel ? (item.riskLevel).toLowerCase() : 'unknown';
  const score  = item.riskScore != null ? item.riskScore : '?';
  const short  = item.address.length > 18
    ? item.address.slice(0, 8) + '…' + item.address.slice(-6)
    : item.address;
  const ago = item.lastChecked ? timeAgo(item.lastChecked) : 'never';

  row.innerHTML = `
    <div class="wl-left">
      <div class="wl-addr" title="${item.address}">${short}</div>
      <div class="wl-chain">${item.chain || '?'} · checked ${ago}</div>
    </div>
    <div class="wl-right">
      <div class="wl-score ${level}">${score}</div>
      <button class="wl-remove" data-addr="${item.address}" title="Remove">×</button>
    </div>
  `;

  // Click address to scan
  row.querySelector('.wl-left').addEventListener('click', () => {
    document.querySelector('[data-tab="scan"]').click();
    addressInput.value = item.address;
    onInputChange();
    if (detectedChain) triggerScan();
  });

  // Remove button
  row.querySelector('.wl-remove').addEventListener('click', async (e) => {
    e.stopPropagation();
    const list = (await getWatchlist()).filter(w => w.address !== item.address);
    await saveWatchlist(list);
    loadWatchlist();
    showToast('Removed from watchlist');
  });

  return row;
}

// Add from watchlist tab input
watchlistAddConfirm.addEventListener('click', addToWatchlist);
watchlistInput.addEventListener('keydown', e => { if (e.key === 'Enter') addToWatchlist(); });

async function addToWatchlist() {
  const addr = watchlistInput.value.trim();
  if (!addr) return;
  const chain = detectChain(addr);
  if (!chain) { showToast('Invalid address'); return; }

  const list = await getWatchlist();
  if (list.find(w => w.address === addr)) { showToast('Already watching'); return; }

  list.unshift({ address: addr, chain, riskScore: null, riskLevel: null, lastChecked: null });
  await saveWatchlist(list);
  watchlistInput.value = '';
  loadWatchlist();
  showToast('Added to watchlist');
}

// Add current result to watchlist (from scan results)
$('watchlist-add-btn').addEventListener('click', async () => {
  if (!lastResult) return;
  const list = await getWatchlist();
  if (list.find(w => w.address === lastResult.address)) {
    showToast('Already watching');
    return;
  }
  list.unshift({
    address: lastResult.address,
    chain: lastResult.chain,
    riskScore: lastResult.riskScore,
    riskLevel: lastResult.riskLevel,
    lastChecked: Date.now(),
  });
  await saveWatchlist(list);
  showToast('Added to watchlist ✓');
  updateWatchlistBadge();
});

// Check all watchlist addresses
checkAllBtn.addEventListener('click', async () => {
  checkAllBtn.disabled = true;
  checkAllBtn.textContent = 'Checking...';
  const list = await getWatchlist();

  for (const item of list) {
    try {
      const { result } = await analyzeAddress(item.address, item.chain || 'ETH');
      item.riskScore  = result.riskScore;
      item.riskLevel  = result.riskLevel;
      item.lastChecked = Date.now();

      // Live update the row
      const row = document.getElementById(`wl-${item.address.slice(0, 12)}`);
      if (row) {
        const level = result.riskLevel.toLowerCase();
        row.querySelector('.wl-score').textContent = result.riskScore;
        row.querySelector('.wl-score').className = `wl-score ${level}`;
        row.querySelector('.wl-chain').textContent = `${item.chain} · just now`;
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 300));
  }

  await saveWatchlist(list);
  checkAllBtn.disabled = false;
  checkAllBtn.innerHTML = `
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path d="M2 6a4 4 0 1 0 8 0 4 4 0 0 0-8 0M6 1v2M6 9v2M1 6h2M9 6h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    </svg>
    Refresh all
  `;
  showToast('Watchlist updated');
});

clearWatchlistBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove('cc_watchlist');
  loadWatchlist();
  updateWatchlistBadge();
  showToast('Watchlist cleared');
});

async function updateWatchlistBadge() {
  const list = await getWatchlist();
  const count = list.length;
  if (count > 0) {
    watchlistCount.textContent = count;
    watchlistCount.classList.remove('hidden');
  } else {
    watchlistCount.classList.add('hidden');
  }
}

// ── Copy formats ──────────────────────────────────────────────────────────────
const copyBtn      = $('copy-btn');
const copyDropdown = $('copy-dropdown');

copyBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  copyDropdown.classList.toggle('hidden');
});

document.addEventListener('click', () => {
  copyDropdown.classList.add('hidden');
});

document.querySelectorAll('.copy-opt').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyDropdown.classList.add('hidden');
    if (!lastResult) return;
    const fmt = btn.dataset.fmt;
    copyAs(fmt);
  });
});

function copyAs(fmt) {
  if (!lastResult) return;
  const { address, chain, riskScore, riskLevel, ofacMatched, signals, typologies, narrative, txCount, analyzedAt } = lastResult;
  const hits = Object.entries(signals || {})
    .filter(([, s]) => s.triggered)
    .map(([k]) => SIGNAL_LABELS[k] || k)
    .join(', ') || 'None';
  const triggeredTypos = (typologies || []).filter(t => t.triggered).map(t => t.name || t.id).join(', ') || 'None';
  const url = `${API_BASE}/?address=${encodeURIComponent(address)}&chain=${chain}`;

  let text = '';

  if (fmt === 'text') {
    text = [
      'ClearChain Risk Report',
      '─'.repeat(32),
      `Address:    ${address}`,
      `Chain:      ${chain}`,
      `Risk Score: ${riskScore}/100 — ${riskLevel}`,
      `OFAC:       ${ofacMatched ? '⚠ MATCH' : 'Clear'}`,
      `Signals:    ${hits}`,
      `Patterns:   ${triggeredTypos}`,
      `Full Report: ${url}`,
    ].join('\n');
  }

  if (fmt === 'json') {
    text = JSON.stringify({
      address,
      chain,
      riskScore,
      riskLevel,
      ofacMatched,
      triggeredSignals: Object.entries(signals || {})
        .filter(([, s]) => s.triggered)
        .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {}),
      typologies: (typologies || []).filter(t => t.triggered),
      analyzedAt,
      source: 'ClearChain',
      url,
    }, null, 2);
  }

  if (fmt === 'compliance') {
    const date = analyzedAt ? new Date(analyzedAt).toLocaleDateString() : new Date().toLocaleDateString();
    text = [
      `BLOCKCHAIN RISK ASSESSMENT — ${date}`,
      '',
      `Subject Address: ${address}`,
      `Blockchain Network: ${chain}`,
      '',
      `RISK CLASSIFICATION: ${riskLevel} (${riskScore}/100)`,
      '',
      `OFAC/SDN Screening: ${ofacMatched ? 'POSITIVE MATCH — FURTHER ACTION REQUIRED' : 'No match found'}`,
      '',
      `Risk Indicators Detected:`,
      ...Object.entries(signals || {})
        .filter(([, s]) => s.triggered)
        .map(([k, s]) => `  • ${SIGNAL_LABELS[k] || k} (+${s.score} pts)`),
      '',
      `Behavioral Typologies:`,
      ...(typologies || []).filter(t => t.triggered)
        .map(t => `  • ${t.name || t.id} (${Math.round((t.confidence || 0) * 100)}% confidence)`),
      '',
      narrative ? `AI Assessment:\n${narrative}` : '',
      '',
      `Transaction Count: ${txCount || 'N/A'}`,
      `Full Report: ${url}`,
      '',
      `Generated by ClearChain AML Intelligence Platform`,
    ].filter(l => l !== null).join('\n');
  }

  navigator.clipboard.writeText(text)
    .then(() => showToast('Copied!'))
    .catch(() => showToast('Copy failed'));
}

// ── Page wallet badge (from content script) ───────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PAGE_WALLETS_FOUND' && msg.count > 0) {
    pageWalletBadge.textContent = `${msg.count} wallet${msg.count === 1 ? '' : 's'} on page`;
    pageWalletBadge.classList.remove('hidden');
  }
});

// ── Show/hide helpers ──────────────────────────────────────────────────────────
function hideAllStates() {
  results.classList.add('hidden');
  emptyState.classList.add('hidden');
  errorState.classList.add('hidden');
}

function showEmpty() {
  hideAllStates();
  emptyState.classList.remove('hidden');
}

function showError(msg) {
  hideAllStates();
  errorMsg.textContent = msg;
  errorState.classList.remove('hidden');
}

// ── Toast ──────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 200);
  }, 2000);
}

// ── Time helper ────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  // Check for pending address from context menu or content script click
  try {
    const stored = await chrome.storage.local.get('pendingAddress');
    if (stored.pendingAddress) {
      const pending = stored.pendingAddress;
      await chrome.storage.local.remove('pendingAddress');
      addressInput.value = pending;
      onInputChange();
      if (detectedChain) triggerScan();
    }
  } catch (_) {}

  // Load badges
  updateHistoryBadge();
  updateWatchlistBadge();

  // Ask active tab for wallet count
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_WALLET_COUNT' })
        .then(resp => {
          if (resp?.count > 0) {
            pageWalletBadge.textContent = `${resp.count} wallet${resp.count === 1 ? '' : 's'} on page`;
            pageWalletBadge.classList.remove('hidden');
          }
        })
        .catch(() => {});
    }
  } catch (_) {}

  // Focus input
  addressInput.focus();
}

init();
