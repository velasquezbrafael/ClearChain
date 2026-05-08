'use client';

interface AdSlotProps {
  isPro: boolean;
  slot?: 'results-banner' | 'sidebar';
}

export default function AdSlot({ isPro, slot = 'results-banner' }: AdSlotProps) {
  if (isPro) return null;

  const isBanner = slot === 'results-banner';

  return (
    <div
      style={{
        width: '100%',
        height: isBanner ? 90 : 250,
        background: 'rgba(255,255,255,0.015)',
        border: '1px solid rgba(255,255,255,0.04)',
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 4,
        margin: '16px 0',
        position: 'relative',
      }}
    >
      {/* AD label — top left */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 8,
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 7,
          letterSpacing: '0.15em',
          color: '#3d4a5c',
        }}
      >
        AD
      </div>

      {/* Placeholder content */}
      <div
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 9,
          letterSpacing: '0.12em',
          color: '#1e4d5c',
          textAlign: 'center',
        }}
      >
        ADVERTISEMENT
      </div>
      <a
        href="/pricing"
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 8,
          letterSpacing: '0.1em',
          color: 'rgba(6,182,212,0.4)',
          textDecoration: 'none',
        }}
      >
        Go Pro to remove ads →
      </a>
    </div>
  );
}
