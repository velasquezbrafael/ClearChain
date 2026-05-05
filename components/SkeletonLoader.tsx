'use client';

interface SkeletonLoaderProps {
  step: number;
  steps: string[];
  isMobile?: boolean;
}

function Skel({ w, h = 16 }: { w: number | string; h?: number }) {
  return (
    <div
      className="skeleton"
      style={{
        width: typeof w === 'number' ? w : w,
        height: h,
        borderRadius: 2,
        flexShrink: 0,
      }}
    />
  );
}

export default function SkeletonLoader({ step, steps, isMobile = false }: SkeletonLoaderProps) {
  return (
    <div
      style={{
        padding: '32px 0',
        animation: 'fadeSlideUp 0.3s ease-out both',
      }}
    >
      {/* Progress steps */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px 32px',
          marginBottom: 40,
          padding: '16px 24px',
          border: '1px solid rgba(6,182,212,0.05)',
          borderRadius: 4,
          background: '#001824',
        }}
      >
        {steps.map((label, i) => (
          <div
            key={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 11,
              letterSpacing: '0.05em',
              color:
                i < step
                  ? '#06b6d4'
                  : i === step
                  ? 'var(--text-primary)'
                  : 'var(--text-dim)',
              transition: 'color 0.3s',
            }}
          >
            {i < step ? (
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#06b6d4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 9,
                  color: '#000',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                OK
              </span>
            ) : i === step ? (
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: '1.5px solid rgba(255,255,255,0.08)',
                  borderTopColor: '#06b6d4',
                  animation: 'spin 0.9s linear infinite',
                  flexShrink: 0,
                }}
              />
            ) : (
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: '1px solid var(--text-dim)',
                  flexShrink: 0,
                }}
              />
            )}
            {label}
          </div>
        ))}
      </div>

      {/* Row 1: address bar placeholder */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 32 }}>
        <Skel w={isMobile ? '55%' : 320} h={14} />
        <Skel w={isMobile ? '30%' : 160} h={14} />
        {!isMobile && (
          <div style={{ marginLeft: 'auto' }}>
            <Skel w={100} h={14} />
          </div>
        )}
      </div>

      {/* Row 2: 3-col layout (single col on mobile — graph only) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '280px 1fr 280px',
          gap: 24,
          marginBottom: 24,
          alignItems: 'start',
        }}
      >
        {/* Col 1: Risk score skeleton — hidden on mobile */}
        {!isMobile && (
          <div
            style={{
              border: '1px solid rgba(6,182,212,0.08)',
              borderRadius: 4,
              background: '#001824',
              padding: 32,
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
          >
            <Skel w={80} h={10} />
            <Skel w={120} h={100} />
            <Skel w={40} h={1} />
            <Skel w={100} h={28} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skel w="100%" h={12} />
              <Skel w="85%" h={12} />
              <Skel w="70%" h={12} />
            </div>
          </div>
        )}

        {/* Col 2: Graph skeleton */}
        <div
          style={{
            border: '1px solid rgba(6,182,212,0.08)',
            borderRadius: 4,
            background: '#001824',
            overflow: 'hidden',
            minHeight: isMobile ? 280 : 500,
            position: 'relative',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(6,182,212,0.05)',
              display: 'flex',
              gap: 16,
            }}
          >
            <Skel w={140} h={12} />
          </div>
          <div
            className="skeleton"
            style={{
              position: 'absolute',
              inset: 0,
              top: 48,
              borderRadius: 0,
            }}
          />
          {/* Ghost nodes */}
          <div style={{ position: 'absolute', inset: 0, top: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: 200, height: 200 }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(6,182,212,0.15)', animation: 'pulseGlow 2s infinite' }} />
              <div style={{ position: 'absolute', top: 10, left: 10, width: 24, height: 24, borderRadius: '50%', background: '#001f2e', animation: 'pulseGlow 2s infinite 0.3s' }} />
              <div style={{ position: 'absolute', top: 10, right: 10, width: 18, height: 18, borderRadius: '50%', background: '#001f2e', animation: 'pulseGlow 2s infinite 0.6s' }} />
              <div style={{ position: 'absolute', bottom: 10, left: 20, width: 20, height: 20, borderRadius: '50%', background: '#001f2e', animation: 'pulseGlow 2s infinite 0.9s' }} />
              <div style={{ position: 'absolute', bottom: 10, right: 20, width: 16, height: 16, borderRadius: '50%', background: '#001f2e', animation: 'pulseGlow 2s infinite 1.2s' }} />
            </div>
          </div>
        </div>

        {/* Col 3: Signal list skeleton — hidden on mobile */}
        {!isMobile && (
          <div
            style={{
              border: '1px solid rgba(6,182,212,0.08)',
              borderRadius: 4,
              background: '#001824',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <Skel w={80} h={10} />
            {[100, 85, 95, 70, 80, 65].map((w, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Skel w={8} h={8} />
                <Skel w={`${w}%`} h={11} />
                <Skel w={28} h={11} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Row 3: Tab panel skeleton */}
      <div
        style={{
          border: '1px solid rgba(6,182,212,0.08)',
          borderRadius: 4,
          background: '#001824',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '0 8px',
            borderBottom: '1px solid rgba(6,182,212,0.08)',
            display: 'flex',
            gap: 4,
          }}
        >
          {[120, 100, 110, 130].map((w, i) => (
            <div key={i} style={{ padding: '14px 16px' }}>
              <Skel w={w} h={10} />
            </div>
          ))}
        </div>
        <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skel w="100%" h={14} />
          <Skel w="90%" h={14} />
          <Skel w="95%" h={14} />
          <Skel w="75%" h={14} />
        </div>
      </div>
    </div>
  );
}
