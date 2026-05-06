/**
 * ClearChain Extension — Service Worker v3
 * Handles API calls, caching, context menu, badge, watchlist alarms.
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const API_BASE = 'https://clearchain.vercel.app';
const WATCHLIST_ALARM = 'cc_watchlist_check';
const WATCHLIST_INTERVAL_MIN = 30;

// ── Install / startup ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'clearchain-scan',
    title: 'Scan with ClearChain',
    contexts: ['selection'],
  });
  chrome.alarms.create(WATCHLIST_ALARM, {
    delayInMinutes: WATCHLIST_INTERVAL_MIN,
    periodInMinutes: WATCHLIST_INTERVAL_MIN,
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.get(WATCHLIST_ALARM, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(WATCHLIST_ALARM, {
        delayInMinutes: WATCHLIST_INTERVAL_MIN,
        periodInMinutes: WATCHLIST_INTERVAL_MIN,
      });
    }
  });
});

// ── Context menu ──────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'clearchain-scan' && info.selectionText) {
    const selected = info.selectionText.trim();
    chrome.storage.local.set({ pendingAddress: selected });
    chrome.action.openPopup().catch(() => {});
  }
});

// ── Chain detection ───────────────────────────────────────────────────────────

function detectChain(address) {
  const a = address.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(a)) return 'ETH';
  if (/^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a) || /^bc1[a-z0-9]{39,59}$/.test(a)) return 'BTC';
  if (/^T[a-zA-Z0-9]{33}$/.test(a)) return 'TRX';
  if (/\.eth$/.test(a)) return 'ETH';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return 'SOL';
  return null;
}

// ── Analysis (with cache) ─────────────────────────────────────────────────────

async function analyzeAddress(address, chain) {
  const cacheKey = `cc_cache_${chain}:${address}`;

  const stored = await chrome.storage.local.get(cacheKey);
  const cached = stored[cacheKey];
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { ...cached.result, fromCache: true };
  }

  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, chain }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  const json = await response.json();
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

  await chrome.storage.local.set({ [cacheKey]: { result, cachedAt: Date.now() } });
  return result;
}

// ── Save to history ───────────────────────────────────────────────────────────

async function saveToHistory(result) {
  const stored = await chrome.storage.local.get('cc_history');
  const history = stored.cc_history || [];
  const filtered = history.filter(h => !(h.address === result.address && h.chain === result.chain));
  const updated = [{ ...result, scannedAt: Date.now() }, ...filtered].slice(0, 20);
  await chrome.storage.local.set({ cc_history: updated });
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

function riskBadgeColor(level) {
  switch ((level || '').toUpperCase()) {
    case 'CRITICAL': return '#ff3b3b';
    case 'HIGH':     return '#ff8c00';
    case 'MEDIUM':   return '#ffd60a';
    case 'LOW':
    case 'CLEAN':    return '#00ff88';
    default:         return '#4a5568';
  }
}

async function setToolbarBadge(text, color) {
  await chrome.action.setBadgeText({ text: text || '' });
  if (color) await chrome.action.setBadgeBackgroundColor({ color });
}

// ── Watchlist background check ────────────────────────────────────────────────

async function checkWatchlist() {
  const stored = await chrome.storage.local.get('cc_watchlist');
  const list = stored.cc_watchlist || [];
  if (!list.length) return;

  let highestRisk  = 0;
  let highestLevel = null;
  const alertAddresses = [];

  for (const item of list) {
    try {
      const result = await analyzeAddress(item.address, item.chain || 'ETH');
      const prevScore = item.riskScore;
      item.riskScore   = result.riskScore;
      item.riskLevel   = result.riskLevel;
      item.lastChecked = Date.now();

      if (result.riskScore > highestRisk) {
        highestRisk  = result.riskScore;
        highestLevel = result.riskLevel;
      }

      if (prevScore != null && result.riskScore > prevScore + 15) {
        alertAddresses.push({ address: item.address, chain: item.chain, riskScore: result.riskScore, riskLevel: result.riskLevel });
      }
    } catch (_) {}

    await new Promise(r => setTimeout(r, 500));
  }

  await chrome.storage.local.set({ cc_watchlist: list });

  if (highestLevel) {
    const level = highestLevel.toUpperCase();
    if (level === 'CRITICAL' || level === 'HIGH') {
      await setToolbarBadge('!', riskBadgeColor(highestLevel));
    } else {
      await setToolbarBadge('', null);
    }
  }

  if (alertAddresses.length > 0) {
    const first = alertAddresses[0];
    const short = first.address.slice(0, 8) + '…' + first.address.slice(-4);
    chrome.notifications?.create?.(`cc_alert_${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'ClearChain Risk Alert',
      message: `${short} risk jumped to ${first.riskLevel} (${first.riskScore}/100)`,
    });
  }
}

// ── Alarm listener ────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WATCHLIST_ALARM) checkWatchlist();
});

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'ANALYZE') {
    const { address, chain } = message;
    analyzeAddress(address, chain)
      .then(async result => {
        await saveToHistory(result);
        sendResponse({ success: true, result });
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_HISTORY') {
    chrome.storage.local.get('cc_history').then(stored => {
      sendResponse({ history: stored.cc_history || [] });
    });
    return true;
  }

  if (message.type === 'CLEAR_HISTORY') {
    chrome.storage.local.remove('cc_history').then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.type === 'GET_PENDING') {
    chrome.storage.local.get('pendingAddress').then(stored => {
      const pending = stored.pendingAddress || null;
      if (pending) chrome.storage.local.remove('pendingAddress');
      sendResponse({ address: pending });
    });
    return true;
  }

  if (message.type === 'PAGE_WALLETS_FOUND') {
    const count = message.count || 0;
    if (count > 0) {
      setToolbarBadge(count > 9 ? '9+' : String(count), '#06b6d4');
    }
    chrome.runtime.sendMessage({ type: 'PAGE_WALLETS_FOUND', count }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'CHECK_WATCHLIST') {
    checkWatchlist()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});
