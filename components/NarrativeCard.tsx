'use client';

interface NarrativeCardProps {
  narrative: string | null;
  address: string;
  analyzedAt: string;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

function truncateAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export default function NarrativeCard({ narrative, address, analyzedAt }: NarrativeCardProps) {
  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-4"
      style={{ background: '#0d0d14', border: '1px solid #1a1a24' }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sm font-mono" style={{ color: '#e2e8f0' }}>AI Narrative</h2>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: '#4b5563' }}>CHAIN-OF-CUSTODY SUMMARY</p>
        </div>
        <div
          className="flex items-center gap-1.5 text-[10px] font-mono rounded-full px-3 py-1"
          style={{ background: '#111118', border: '1px solid #1a1a24', color: '#4b5563' }}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          Claude Haiku
        </div>
      </div>

      <div className="flex-1">
        {narrative && !narrative.toLowerCase().includes('generation failed') ? (
          <p className="text-sm leading-8" style={{ color: '#d1d5db', fontFamily: 'Georgia, serif' }}>
            {narrative}
          </p>
        ) : narrative ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="#f97316" aria-hidden="true">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <p className="text-xs font-mono" style={{ color: '#f97316' }}>Narrative generation failed</p>
            <p className="text-[10px] font-mono" style={{ color: '#374151' }}>Re-analyze to retry</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
            <div className="w-6 h-6 rounded-full border-2 border-t-[#00ff88] animate-spin" style={{ borderColor: '#1a1a24', borderTopColor: '#00ff88' }} />
            <p className="text-xs font-mono" style={{ color: '#374151' }}>Generating narrative...</p>
          </div>
        )}
      </div>

      <div
        className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] font-mono"
        style={{ borderTop: '1px solid #1a1a24', color: '#374151' }}
      >
        <span title={address}>{truncateAddress(address)}</span>
        <span>Analyzed: {formatTimestamp(analyzedAt)}</span>
      </div>
    </div>
  );
}
