/**
 * ClearChain Content Script
 * - Scans page DOM for wallet addresses
 * - Reports count to background (badge update)
 * - Injects inline risk badges next to found addresses
 */

(function () {
  'use strict';

  // ── Wallet regex patterns ─────────────────────────────────────────────────

  const PATTERNS = {
    ETH: /\b0x[a-fA-F0-9]{40}\b/g,
    BTC: /\b(?:(?:1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59})\b/g,
    TRX: /\bT[a-zA-Z0-9]{33}\b/g,
    SOL: /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g,
  };

  const CC_ATTR = 'data-cc-scanned';
  const CC_BADGE_CLASS = 'cc-inline-badge';

  // ── Detect all wallet addresses on page ───────────────────────────────────

  function findWallets() {
    const found = new Map(); // address -> chain
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const tag = node.parentElement?.tagName?.toLowerCase();
          if (['script', 'style', 'noscript', 'textarea', 'input'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (node.parentElement?.hasAttribute(CC_ATTR)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent;
      for (const [chain, re] of Object.entries(PATTERNS)) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
          const addr = m[0];
          if (!found.has(addr)) found.set(addr, chain);
        }
      }
    }
    return found;
  }

  // ── Inject inline badge next to an address in a text node ─────────────────

  function injectBadge(textNode, address, chain, riskLevel) {
    const text = textNode.textContent;
    const idx = text.indexOf(address);
    if (idx === -1) return;

    const color = levelColor(riskLevel);
    const label = riskLevel ? riskLevel.charAt(0) : '?';

    const before = document.createTextNode(text.slice(0, idx));
    const after  = document.createTextNode(text.slice(idx + address.length));

    const addrSpan = document.createElement('span');
    addrSpan.setAttribute(CC_ATTR, '1');
    addrSpan.textContent = address;
    addrSpan.style.cssText = 'border-bottom: 1px dotted ' + color + '; cursor: pointer;';
    addrSpan.title = 'ClearChain: ' + (riskLevel || 'unscanned') + ' — click to scan';

    const dot = document.createElement('span');
    dot.className = CC_BADGE_CLASS;
    dot.setAttribute(CC_ATTR, '1');
    dot.textContent = label;
    dot.style.cssText = [
      'display:inline-block',
      'margin-left:3px',
      'width:14px',
      'height:14px',
      'line-height:14px',
      'border-radius:50%',
      'background:' + color,
      'color:#000',
      'font-size:8px',
      'font-weight:700',
      'text-align:center',
      'font-family:monospace',
      'vertical-align:middle',
      'cursor:pointer',
      'opacity:0.9',
    ].join(';');

    dot.title = 'ClearChain: ' + chain + ' · ' + (riskLevel || 'click to scan');

    // Click dot → send address to popup via storage
    const clickHandler = (e) => {
      e.stopPropagation();
      chrome.storage.local.set({ pendingAddress: address });
    };
    addrSpan.addEventListener('click', clickHandler);
    dot.addEventListener('click', clickHandler);

    const frag = document.createDocumentFragment();
    frag.appendChild(before);
    frag.appendChild(addrSpan);
    frag.appendChild(dot);
    frag.appendChild(after);

    textNode.parentNode.replaceChild(frag, textNode);
  }

  // ── Color map ─────────────────────────────────────────────────────────────

  function levelColor(level) {
    switch ((level || '').toUpperCase()) {
      case 'CRITICAL': return '#ff3b3b';
      case 'HIGH':     return '#ff8c00';
      case 'MEDIUM':   return '#ffd60a';
      case 'LOW':
      case 'CLEAN':    return '#00ff88';
      default:         return '#4a5568'; // gray = unscanned
    }
  }

  // ── Check cache for known risk levels ─────────────────────────────────────

  async function getRiskLevels(addresses) {
    const keys = [];
    for (const [addr, chain] of addresses) {
      keys.push(`cc_cache_${chain}:${addr}`);
    }
    if (!keys.length) return {};
    const stored = await chrome.storage.local.get(keys);
    const out = {};
    for (const [addr, chain] of addresses) {
      const k = `cc_cache_${chain}:${addr}`;
      const hit = stored[k];
      if (hit?.result?.riskLevel) out[addr] = hit.result.riskLevel;
    }
    return out;
  }

  // ── Inject badges into page ───────────────────────────────────────────────

  async function run() {
    const wallets = findWallets();
    if (!wallets.size) return;

    // Report count to background for toolbar badge
    chrome.runtime.sendMessage({
      type: 'PAGE_WALLETS_FOUND',
      count: wallets.size,
    });

    // Get cached risk levels
    const riskMap = await getRiskLevels(wallets);

    // Inject inline badges
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const tag = node.parentElement?.tagName?.toLowerCase();
          if (['script', 'style', 'noscript', 'textarea', 'input'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (node.parentElement?.hasAttribute(CC_ATTR)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const toProcess = [];
    let node;
    while ((node = walker.nextNode())) {
      toProcess.push(node);
    }

    for (const textNode of toProcess) {
      const text = textNode.textContent;
      for (const [addr] of wallets) {
        if (text.includes(addr)) {
          const chain = wallets.get(addr);
          const level = riskMap[addr] || null;
          injectBadge(textNode, addr, chain, level);
          break; // one address per text node per pass; re-run catches others
        }
      }
    }
  }

  // ── Listen for messages ───────────────────────────────────────────────────

  let detectedCount = 0;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_WALLET_COUNT') {
      sendResponse({ count: detectedCount });
      return true;
    }
    if (msg.type === 'RISK_UPDATE') {
      // Update dot color/label for a freshly-scanned address
      const { address, riskLevel } = msg;
      const color = levelColor(riskLevel);
      const label = riskLevel?.charAt(0) || '?';
      document.querySelectorAll('.' + CC_BADGE_CLASS).forEach(dot => {
        if (dot.previousSibling?.textContent === address ||
            dot.previousElementSibling?.textContent === address) {
          dot.style.background = color;
          dot.textContent = label;
          dot.title = 'ClearChain: ' + riskLevel;
        }
      });
    }
  });

  // ── Run ───────────────────────────────────────────────────────────────────

  async function runAndCount() {
    const wallets = findWallets();
    detectedCount = wallets.size;
    await run();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAndCount);
  } else {
    runAndCount();
  }

  // Re-run on significant DOM mutations (SPAs like Uniswap)
  let mutationTimer;
  const observer = new MutationObserver(() => {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(runAndCount, 1500);
  });
  observer.observe(document.body, { childList: true, subtree: true });

})();
