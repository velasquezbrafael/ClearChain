'use client';

import { useState } from 'react';
import type { WalletTransaction } from '@/types';

const HIGH_RISK_ADDRESSES = new Set([
  '0x098b716b8aaf21512996dc57eb0615e2383e2f96',
  '0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b',
  '0x3cffd56b47278a68122e1c1d25614bae3641af42',
  '0x53b6936513e738f44fb50d2b9476730c0d3170e2',
  '0x7f367cc41522ce07553e823bf3be79a889debe1b',
  '0xd882cfc20f52f2599d84b8e8d58c7fb62cfe344b',
  '0x901bb9583b24d97e995513c6778dc6888ab6870e',
  '0x8576acc5c05d6ce88f4e49bf65bdf0c62f91353c',
]);

const MIXER_ADDRESSES = new Set([
  '0x722122df12d4e14e13ac3b6895a86e84145b6967',
  '0xdd4c48c0b24039969fc16d1cdf626eab821d3384',
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b',
  '0x4736dcf1b7a3d580672cce6e7c65cd5cc9cfba9d',
  '0xd96f2b1c14db8458374d9aca76e26c3950113464',
  '0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144',
  '0x07687e702b410fa43f4cb4af7fa097918ffd2730',
  '0x23773e65ed146a459667303b90d093cbf37d16cf',
  '0x22aaa7720ddd5388a3c0a3333430953c68f1849b',
  '0x03893a7c7463ae47d46bc7f091665f1893656003',
  '0x2717c5e28cf931547b621a5dddb772ab6a35b701',
  '0xca0840578f57fe71599d29375e16783424023357',
]);

function truncateAddr(addr: string): string {
  if (!addr || addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function formatDate(ts: number): string {
  try {
    return new Date(ts * 1000).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(ts);
  }
}

function isRiskyAddress(addr: string): { risky: boolean; reason: string } {
  const lower = addr.toLowerCase();
  if (MIXER_ADDRESSES.has(lower)) return { risky: true, reason: 'Tornado Cash (OFAC SDN)' };
  if (HIGH_RISK_ADDRESSES.has(lower)) return { risky: true, reason: 'High-risk counterparty' };
  return { risky: false, reason: '' };
}

function AddressCell({ addr }: { addr: string }) {
  const [copied, setCopied] = useState(false);
  const { risky, reason } = isRiskyAddress(addr);

  async function copy() {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
    }
  }

  return (
    <span className="inline-flex items-center gap-1 group">
      <span
        className="font-mono text-xs"
        style={{ color: risky ? '#ef4444' : '#6b7280' }}
        title={addr}
      >
        {truncateAddr(addr)}
      </span>
      {risky && (
        <span title={reason} aria-label={reason} style={{ color: '#f97316' }} className="text-xs">
          ⚠
        </span>
      )}
      <button
        onClick={copy}
        className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-gray-400"
        style={{ color: '#374151' }}
        aria-label={`Copy ${addr}`}
      >
        {copied ? (
          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="#00ff88" aria-hidden="true">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
            <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
          </svg>
        )}
      </button>
    </span>
  );
}

function RiskFlag({ tx }: { tx: WalletTransaction }) {
  const toRisky = isRiskyAddress(tx.to);
  const fromRisky = isRiskyAddress(tx.from);
  if (!toRisky.risky && !fromRisky.risky) return <span style={{ color: '#1f2937' }}>—</span>;
  const reason = toRisky.risky ? toRisky.reason : fromRisky.reason;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-mono" style={{ color: '#f97316' }} title={reason}>
      <span aria-hidden="true">⚠</span>
      <span className="hidden sm:inline">{reason}</span>
    </span>
  );
}

const MAX_DISPLAY = 20;

export default function TransactionBreakdown({
  transactions,
  queriedAddress,
}: {
  transactions: WalletTransaction[];
  queriedAddress: string;
}) {
  const sorted = [...transactions].sort((a, b) => b.timestamp - a.timestamp);
  const display = sorted.slice(0, MAX_DISPLAY);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#0d0d14', border: '1px solid #1a1a24' }}>
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid #1a1a24' }}
      >
        <div>
          <h2 className="font-semibold text-sm font-mono" style={{ color: '#e2e8f0' }}>Transaction Breakdown</h2>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: '#4b5563' }}>
            Showing {display.length} of {transactions.length} transactions
          </p>
        </div>
        <span
          className="text-[10px] font-mono rounded-full px-3 py-1"
          style={{ background: '#111118', border: '1px solid #1a1a24', color: '#4b5563' }}
        >
          {truncateAddr(queriedAddress)}
        </span>
      </div>

      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
          <p className="text-sm font-mono" style={{ color: '#374151' }}>No transactions found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-[10px] font-mono font-semibold tracking-wider uppercase"
                style={{ background: '#111118', borderBottom: '1px solid #1a1a24', color: '#4b5563' }}
              >
                <th className="px-4 py-3 text-left whitespace-nowrap">Date / Time</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Amount</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">From</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">To</th>
                <th className="px-4 py-3 text-left">Risk</th>
              </tr>
            </thead>
            <tbody>
              {display.map((tx, idx) => {
                const isInbound = tx.isInbound ?? tx.to.toLowerCase() === queriedAddress.toLowerCase();
                return (
                  <tr
                    key={`${tx.hash}-${idx}`}
                    style={{
                      borderBottom: '1px solid #111118',
                      background: idx % 2 === 0 ? '#0d0d14' : '#0a0a0f',
                    }}
                  >
                    <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: '#4b5563' }}>
                      {formatDate(tx.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center text-[10px] font-bold font-mono px-2 py-0.5 rounded-full"
                        style={
                          isInbound
                            ? { background: 'rgba(6,78,59,0.4)', color: '#6ee7b7', border: '1px solid #064e3b' }
                            : { background: 'rgba(127,29,29,0.3)', color: '#fca5a5', border: '1px solid #7f1d1d' }
                        }
                      >
                        {isInbound ? '↓ IN' : '↑ OUT'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="font-mono text-xs" style={{ color: '#e2e8f0' }}>{tx.value.toFixed(4)}</span>
                      <span className="text-xs ml-1" style={{ color: '#4b5563' }}>{tx.tokenSymbol ?? 'ETH'}</span>
                    </td>
                    <td className="px-4 py-3"><AddressCell addr={tx.from} /></td>
                    <td className="px-4 py-3"><AddressCell addr={tx.to} /></td>
                    <td className="px-4 py-3 whitespace-nowrap"><RiskFlag tx={tx} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {transactions.length > MAX_DISPLAY && (
        <div
          className="px-6 py-3 text-center text-[10px] font-mono"
          style={{ borderTop: '1px solid #1a1a24', color: '#374151' }}
        >
          {transactions.length - MAX_DISPLAY} additional transactions not shown.
          Full history available via the Etherscan API.
        </div>
      )}
    </div>
  );
}
