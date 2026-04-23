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

function truncateHash(hash: string): string {
  if (!hash || hash.length <= 14) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
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

function riskTag(addr: string): { label: string; color: string } | null {
  const lower = addr.toLowerCase();
  if (MIXER_ADDRESSES.has(lower)) return { label: 'OFAC SDN', color: '#ff3b3b' };
  if (HIGH_RISK_ADDRESSES.has(lower)) return { label: 'HIGH RISK', color: '#ff8c00' };
  return null;
}

// FIX: flag only if the COUNTERPARTY is high-risk (not the queried address itself)
function isTxFlagged(tx: WalletTransaction, queriedAddress: string): boolean {
  const selfLower = queriedAddress.toLowerCase();
  const counterparty = tx.isInbound ? tx.from.toLowerCase() : tx.to.toLowerCase();
  if (counterparty === selfLower) return false;
  return riskTag(counterparty) !== null;
}

function AddressCell({ addr }: { addr: string }) {
  const [copied, setCopied] = useState(false);
  const tag = riskTag(addr);

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
    <span className="group" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 12,
          color: tag ? tag.color : 'var(--text-secondary)',
        }}
        title={addr}
      >
        {truncateAddr(addr)}
      </span>
      {tag && (
        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 9,
            letterSpacing: '0.08em',
            padding: '2px 6px',
            border: `1px solid ${tag.color}33`,
            background: `${tag.color}0d`,
            color: tag.color,
            borderRadius: 2,
          }}
        >
          {tag.label}
        </span>
      )}
      <button
        onClick={copy}
        style={{
          opacity: 0,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          color: copied ? '#00ff88' : 'var(--text-dim)',
          fontSize: 10,
          lineHeight: 1,
          transition: 'opacity 0.15s',
        }}
        className="group-hover:opacity-100"
        aria-label={`Copy ${addr}`}
      >
        {copied ? '✓' : '⊕'}
      </button>
    </span>
  );
}

const MAX_DISPLAY = 25;

export default function TransactionBreakdown({
  transactions,
  queriedAddress,
}: {
  transactions: WalletTransaction[];
  queriedAddress: string;
}) {
  const sorted = [...transactions].sort((a, b) => b.timestamp - a.timestamp);
  const display = sorted.slice(0, MAX_DISPLAY);

  // Fixed: exclude self-references when counting flagged
  const flaggedCount = transactions.filter(tx => isTxFlagged(tx, queriedAddress)).length;

  if (transactions.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 32px',
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 11,
          color: 'var(--text-dim)',
          letterSpacing: '0.12em',
        }}
      >
        NO TRANSACTIONS FOUND
      </div>
    );
  }

  return (
    <div>
      {/* Stats row */}
      <div
        style={{
          display: 'flex',
          gap: 32,
          marginBottom: 24,
          paddingBottom: 20,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: 'var(--text-dim)', marginBottom: 4 }}>
            TOTAL
          </div>
          <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
            {transactions.length}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: 'var(--text-dim)', marginBottom: 4 }}>
            SHOWING
          </div>
          <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
            {display.length}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: 'var(--text-dim)', marginBottom: 4 }}>
            FLAGGED
          </div>
          <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 24, fontWeight: 700, color: flaggedCount > 0 ? '#ff3b3b' : 'var(--text-primary)' }}>
            {flaggedCount}
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['HASH', 'DATE', 'DIR', 'AMOUNT', 'FROM', 'TO'].map(col => (
                <th
                  key={col}
                  style={{
                    padding: '8px 16px',
                    textAlign: col === 'AMOUNT' ? 'right' : 'left',
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 9,
                    letterSpacing: '0.15em',
                    color: 'var(--text-dim)',
                    fontWeight: 400,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {display.map((tx, idx) => {
              const isInbound = tx.isInbound ?? tx.to.toLowerCase() === queriedAddress.toLowerCase();
              const flagged = isTxFlagged(tx, queriedAddress);

              return (
                <tr
                  key={`${tx.hash}-${idx}`}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    background: flagged ? 'rgba(255,59,59,0.03)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = flagged ? 'rgba(255,59,59,0.06)' : 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = flagged ? 'rgba(255,59,59,0.03)' : 'transparent'; }}
                >
                  {/* Hash — links to Etherscan */}
                  <td style={{ padding: '11px 16px' }}>
                    <a
                      href={`https://etherscan.io/tx/${tx.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={tx.hash}
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono)',
                        fontSize: 11,
                        color: 'var(--text-dim)',
                        textDecoration: 'none',
                        transition: 'color 0.15s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#00ff88'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-dim)'; }}
                    >
                      {truncateHash(tx.hash)}
                    </a>
                  </td>
                  <td
                    style={{
                      padding: '11px 16px',
                      fontFamily: 'var(--font-jetbrains-mono)',
                      fontSize: 11,
                      color: 'var(--text-dim)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatDate(tx.timestamp)}
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono)',
                        fontSize: 10,
                        letterSpacing: '0.08em',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 2,
                        ...(isInbound
                          ? { background: 'rgba(0,255,136,0.08)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.2)' }
                          : { background: 'rgba(255,59,59,0.08)', color: '#ff6b6b', border: '1px solid rgba(255,59,59,0.2)' }),
                      }}
                    >
                      {isInbound ? 'IN' : 'OUT'}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '11px 16px',
                      textAlign: 'right',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: 'var(--text-primary)' }}>
                      {tx.value.toFixed(4)}
                    </span>
                    <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: 'var(--text-dim)', marginLeft: 5 }}>
                      {tx.tokenSymbol ?? 'ETH'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <AddressCell addr={tx.from} />
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <AddressCell addr={tx.to} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {transactions.length > MAX_DISPLAY && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: '1px solid rgba(255,255,255,0.04)',
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            color: 'var(--text-dim)',
            letterSpacing: '0.1em',
            textAlign: 'center',
          }}
        >
          {transactions.length - MAX_DISPLAY} additional transactions not shown — full history via Alchemy API
        </div>
      )}
    </div>
  );
}
