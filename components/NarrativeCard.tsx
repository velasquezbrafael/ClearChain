'use client';

interface NarrativeCardProps {
  narrative: string | null;
  address: string;
  analyzedAt: string;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
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
  const isFailed = !!narrative && narrative.toLowerCase().includes('generation failed');
  const isReady = !!narrative && !isFailed;

  if (isFailed) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 32px',
          textAlign: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#ff8c00',
          }}
        />
        <p
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 11,
            letterSpacing: '0.12em',
            color: '#ff8c00',
          }}
        >
          GENERATION FAILED
        </p>
        <p style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
          Re-analyze to retry
        </p>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 32px',
          gap: 16,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: '1.5px solid rgba(255,255,255,0.08)',
            borderTopColor: '#00ff88',
            animation: 'spin 0.9s linear infinite',
          }}
        />
        <p style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
          Generating narrative...
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Attribution line */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 32,
          paddingBottom: 20,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 10px',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 2,
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ff8c00"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 10,
              letterSpacing: '0.1em',
              color: 'var(--text-secondary)',
            }}
          >
            CLAUDE HAIKU
          </span>
        </div>

        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            color: 'var(--text-dim)',
          }}
          title={address}
        >
          {truncateAddress(address)}
        </span>

        <span
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            color: 'var(--text-dim)',
            marginLeft: 'auto',
          }}
        >
          {formatTimestamp(analyzedAt)}
        </span>
      </div>

      {/* Intelligence briefing text */}
      <p
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 16,
          lineHeight: 2,
          color: 'var(--text-primary)',
          textIndent: '2em',
          margin: 0,
          letterSpacing: '0.01em',
        }}
      >
        {narrative}
      </p>
    </div>
  );
}
