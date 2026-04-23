'use client';

import { useState } from 'react';

interface SARDraftCardProps {
  sarDraft: string | null;
  onDownload?: () => void;
}

export default function SARDraftCard({ sarDraft, onDownload }: SARDraftCardProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!sarDraft) return;
    try {
      await navigator.clipboard.writeText(sarDraft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  }

  const isFailed = !!sarDraft && sarDraft.toLowerCase().includes('generation failed');
  const isReady = !!sarDraft && !isFailed;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#0d0d14', border: '1px solid #1a1a24' }}>
      {/* Header */}
      <div
        className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        style={{ borderBottom: '1px solid #1a1a24' }}
      >
        <div>
          <h2 className="font-semibold text-sm font-mono" style={{ color: '#e2e8f0' }}>SAR Draft</h2>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: '#4b5563' }}>FINCEN-STYLE SUSPICIOUS ACTIVITY REPORT</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={!isReady}
            className="flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:text-gray-100"
            style={{ background: '#111118', border: '1px solid #1a1a24', color: '#6b7280' }}
            aria-label="Copy SAR text"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="#00ff88" aria-hidden="true">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
                <span style={{ color: '#00ff88' }}>Copied</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                  <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                </svg>
                Copy
              </>
            )}
          </button>

          <button
            onClick={onDownload}
            disabled={!isReady}
            className="flex items-center gap-1.5 text-xs font-mono font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            style={{ background: '#00ff88', color: '#000' }}
            aria-label="Download SAR draft"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
              <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
            </svg>
            Download
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 space-y-4">
        {isReady ? (
          <pre
            className="text-xs leading-relaxed whitespace-pre-wrap overflow-auto max-h-96 rounded-xl p-4"
            style={{ fontFamily: 'monospace', background: '#111118', border: '1px solid #1a1a24', color: '#9ca3af' }}
          >
            {sarDraft}
          </pre>
        ) : isFailed ? (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="#f97316" aria-hidden="true">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <p className="text-xs font-mono" style={{ color: '#f97316' }}>SAR draft generation failed</p>
            <p className="text-[10px] font-mono" style={{ color: '#374151' }}>Re-analyze to retry</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
            <div className="w-6 h-6 rounded-full border-2 border-t-[#00ff88] animate-spin" style={{ borderColor: '#1a1a24', borderTopColor: '#00ff88' }} />
            <p className="text-xs font-mono" style={{ color: '#374151' }}>Generating SAR draft...</p>
          </div>
        )}

        <div
          className="flex items-start gap-2.5 rounded-xl px-4 py-3"
          style={{ background: 'rgba(124,45,18,0.2)', border: '1px solid rgba(124,45,18,0.4)' }}
        >
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="#f97316" aria-hidden="true">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <p className="text-xs leading-relaxed" style={{ color: '#fdba74' }}>
            <strong>For compliance officer review only — not a filed SAR.</strong>{' '}
            This AI-generated draft must be reviewed, verified, and approved by a qualified
            BSA/AML officer before any submission to FinCEN.
          </p>
        </div>
      </div>
    </div>
  );
}
