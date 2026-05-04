import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
} from 'remotion';

// ─── Tokens ────────────────────────────────────────────────────────────────────
const BG = '#03040a';
const CARD = '#080b14';
const GREEN = '#00ff88';
const RED = '#ff3b3b';
const ORANGE = '#ff8c00';
const GRAY = '#555e6e';
const TEXT = '#f0f4ff';
const TEXT2 = '#8892a4';
const BORDER = 'rgba(255,255,255,0.10)';

const CLAMP = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

// ─── Helpers ───────────────────────────────────────────────────────────────────
function spr(frame: number, delay: number, fps: number, damping = 22, stiffness = 180) {
  const f = frame - delay;
  if (f < 0) return 0;
  return spring({ frame: f, fps, config: { damping, stiffness } });
}

function fadeIn(frame: number, start: number, end: number) {
  return interpolate(frame, [start, end], [0, 1], CLAMP);
}

function fadeOut(frame: number, start: number, end: number) {
  return interpolate(frame, [start, end], [1, 0], CLAMP);
}

function slideUp(frame: number, delay: number, fps: number) {
  const s = spr(frame, delay, fps);
  return interpolate(s, [0, 1], [20, 0]);
}

// ─── Noise background ──────────────────────────────────────────────────────────
const NoiseBg: React.FC<{ frame: number }> = ({ frame }) => (
  <AbsoluteFill style={{ pointerEvents: 'none', opacity: 0.03 }}>
    <svg width="100%" height="100%">
      <filter id="noise">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.65"
          numOctaves="3"
          seed={Math.floor(frame / 6)}
          stitchTiles="stitch"
        />
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" />
    </svg>
  </AbsoluteFill>
);

// ─── CC Logo ───────────────────────────────────────────────────────────────────
const CCLogo: React.FC<{ size?: number }> = ({ size = 72 }) => {
  const s = size;
  const hex = (cx: number, cy: number, r: number) => {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (60 * i - 30);
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    }).join(' ');
    return pts;
  };
  const r = s * 0.44;
  const cx = s / 2;
  const cy = s / 2;
  const offset = s * 0.07;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <polygon points={hex(cx, cy, r)} fill="none" stroke={GREEN} strokeWidth="2.5" />
      <polygon
        points={hex(cx + offset, cy - offset, r)}
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="2.5"
      />
    </svg>
  );
};

// ─── Scene 1 — Logo reveal (0–75) ─────────────────────────────────────────────
const Scene1: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const logoScale = spr(frame, 0, fps, 20, 120);
  const logoOpacity = logoScale;

  const text = 'ClearChain';
  const charCount = Math.floor(interpolate(frame, [40, 68], [0, text.length], CLAMP));

  const fadeOutOp = frame >= 65 ? fadeOut(frame, 65, 75) : 1;

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 24,
        opacity: fadeOutOp,
      }}
    >
      <div
        style={{
          transform: `scale(${logoScale})`,
          opacity: logoOpacity,
        }}
      >
        <CCLogo size={88} />
      </div>
      <div
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 56,
          fontWeight: 700,
          color: TEXT,
          letterSpacing: -2,
          opacity: frame >= 40 ? 1 : 0,
          minHeight: 68,
        }}
      >
        {text.slice(0, charCount)}
        {charCount < text.length && charCount > 0 && (
          <span style={{ color: GREEN, opacity: Math.floor(frame / 5) % 2 === 0 ? 1 : 0 }}>|</span>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 2 — Risk score demo (75–210) ───────────────────────────────────────
const Scene2: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  // Card slide in
  const cardS = spr(frame, 75, fps);
  const cardTY = interpolate(cardS, [0, 1], [30, 0]);
  const cardOp = cardS;

  // Score count-up 0→87 frames 95–150
  const score = Math.round(interpolate(frame, [95, 150], [0, 87], CLAMP));

  // Arc gauge: stroke-dasharray 352, offset goes from 352→45.76
  const gaugeProgress = interpolate(frame, [95, 150], [0, 1], CLAMP);
  const dashOffset = 352 - gaugeProgress * (352 - 45.76);

  // CRITICAL badge
  const badgeOp = fadeIn(frame, 140, 155);

  // Signal rows
  const signals = [
    { color: RED, label: 'OFAC / SDN Match', status: 'TRIGGERED' },
    { color: RED, label: 'Mixer Interaction', status: 'Tornado Cash' },
    { color: ORANGE, label: 'Rapid Movement', status: 'TRIGGERED' },
    { color: ORANGE, label: 'High-risk Counterparty', status: 'TRIGGERED' },
  ];

  // Fade out
  const sceneOp = frame >= 200 ? fadeOut(frame, 200, 210) : 1;

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
        opacity: sceneOp,
      }}
    >
      <div
        style={{
          width: '100%',
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 4,
          padding: '28px 24px 32px',
          transform: `translateY(${cardTY}px)`,
          opacity: cardOp,
        }}
      >
        {/* Wallet address */}
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13,
            color: TEXT2,
            marginBottom: 24,
          }}
        >
          0x8589...FDA16
        </div>

        {/* Score + gauge */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, height: 140 }}>
          {/* SVG arc */}
          <svg
            width="128"
            height="128"
            style={{ position: 'absolute' }}
          >
            {/* Track */}
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="rgba(255,59,59,0.15)"
              strokeWidth="4"
            />
            {/* Arc */}
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke={RED}
              strokeWidth="4"
              strokeDasharray="352"
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 64 64)"
            />
          </svg>
          {/* Score number */}
          <div
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 96,
              fontWeight: 700,
              color: RED,
              letterSpacing: -2,
              lineHeight: 1,
              position: 'relative',
            }}
          >
            {score}
          </div>
        </div>

        {/* CRITICAL badge */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28, opacity: badgeOp }}>
          <div
            style={{
              background: 'rgba(255,59,59,0.15)',
              border: `1px solid ${RED}`,
              borderRadius: 100,
              padding: '4px 16px',
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 12,
              fontWeight: 600,
              color: RED,
              letterSpacing: 1.5,
            }}
          >
            CRITICAL
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: BORDER, marginBottom: 20, opacity: badgeOp }} />

        {/* Signal rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {signals.map((sig, i) => {
            const rowOp = fadeIn(frame, 155 + i * 11, 165 + i * 11);
            const rowTY = interpolate(rowOp, [0, 1], [8, 0]);
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  opacity: rowOp,
                  transform: `translateY(${rowTY}px)`,
                }}
              >
                <svg width="8" height="8" style={{ flexShrink: 0 }}>
                  <circle cx="4" cy="4" r="4" fill={sig.color} />
                </svg>
                <span
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 15,
                    color: TEXT,
                    flex: 1,
                  }}
                >
                  {sig.label}
                </span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 13,
                    color: TEXT2,
                  }}
                >
                  {sig.status}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 3 — Investigation graph (210–300) ───────────────────────────────────
const Scene3: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const titleOp = fadeIn(frame, 210, 225);
  const subtitleOp = fadeIn(frame, 225, 235);

  // SVG panel slide up
  const panelS = spr(frame, 220, fps);
  const panelTY = interpolate(panelS, [0, 1], [20, 0]);

  // Root node visible after frame 235
  const rootVisible = frame >= 235;

  // Sonar pulse (looping)
  const sonarPhase = (frame - 235) % 45;
  const sonarR = interpolate(sonarPhase, [0, 45], [20, 44], CLAMP);
  const sonarOp = interpolate(sonarPhase, [0, 45], [0.7, 0], CLAMP);

  // Child nodes
  // Center of SVG panel: 450, 300
  const CX = 450;
  const CY = 300;
  const childNodes = [
    { color: RED, r: 14, label: 'Tornado Cash', dx: 160, dy: -140 },
    { color: ORANGE, r: 12, label: '0x3f2a...', dx: 200, dy: 0 },
    { color: RED, r: 14, label: 'OFAC Hit', dx: 160, dy: 140 },
    { color: GRAY, r: 11, label: '0x9c4b...', dx: 0, dy: 200, dashed: true },
  ];

  const sceneOp = frame >= 295 ? fadeOut(frame, 295, 300) : 1;

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'flex-start',
        flexDirection: 'column',
        padding: '80px 24px 0',
        opacity: sceneOp,
      }}
    >
      {/* Title */}
      <div
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 28,
          fontWeight: 700,
          color: TEXT,
          letterSpacing: -1,
          opacity: titleOp,
          marginBottom: 8,
          alignSelf: 'flex-start',
        }}
      >
        Investigation Mode
      </div>
      <div
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 17,
          color: TEXT2,
          opacity: subtitleOp,
          marginBottom: 28,
          alignSelf: 'flex-start',
        }}
      >
        Trace every hop.
      </div>

      {/* SVG Graph Panel */}
      <div
        style={{
          width: '100%',
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 4,
          overflow: 'hidden',
          transform: `translateY(${panelTY}px)`,
          opacity: panelS,
        }}
      >
        <svg width="100%" height="600" viewBox="0 0 900 600">
          {rootVisible &&
            childNodes.map((node, i) => {
              const startFrame = 250 + i * 12;
              const edgeProgress = interpolate(frame, [startFrame, startFrame + 18], [0, 1], CLAMP);
              const nx = CX + node.dx;
              const ny = CY + node.dy;
              const dx = nx - CX;
              const dy = ny - CY;
              const lineLen = Math.sqrt(dx * dx + dy * dy);
              const dashTotal = lineLen;
              const dashOffset = dashTotal * (1 - edgeProgress);
              return (
                <line
                  key={i}
                  x1={CX}
                  y1={CY}
                  x2={nx}
                  y2={ny}
                  stroke={node.dashed ? GRAY : node.color}
                  strokeWidth="1.5"
                  strokeOpacity={0.5}
                  strokeDasharray={node.dashed ? '6 4' : `${dashTotal}`}
                  strokeDashoffset={node.dashed ? 0 : dashOffset}
                />
              );
            })}

          {/* Root node sonar */}
          {rootVisible && frame >= 235 && (
            <circle cx={CX} cy={CY} r={sonarR} fill="none" stroke={GREEN} strokeWidth="1.5" opacity={sonarOp} />
          )}

          {/* Root node */}
          {rootVisible && (
            <g>
              <circle cx={CX} cy={CY} r={20} fill={GREEN} />
              <text
                x={CX}
                y={CY + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="'JetBrains Mono', monospace"
                fontSize="9"
                fill={BG}
                fontWeight="600"
              >
                0x8589...
              </text>
            </g>
          )}

          {/* Child nodes */}
          {childNodes.map((node, i) => {
            const startFrame = 250 + i * 12;
            const nodeOp = interpolate(frame, [startFrame + 10, startFrame + 18], [0, 1], CLAMP);
            const nx = CX + node.dx;
            const ny = CY + node.dy;
            return (
              <g key={i} opacity={nodeOp}>
                <circle cx={nx} cy={ny} r={node.r} fill={node.color} fillOpacity={0.2} stroke={node.color} strokeWidth="1.5" />
                <text
                  x={nx}
                  y={ny + node.r + 14}
                  textAnchor="middle"
                  fontFamily="'JetBrains Mono', monospace"
                  fontSize="10"
                  fill={TEXT2}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 4 — CTA (300–360) ───────────────────────────────────────────────────
const Scene4: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const logoScale = spr(frame, 300, fps, 22, 180);

  const urlOp = fadeIn(frame, 325, 340);
  const subOp = fadeIn(frame, 340, 355);

  const cursorVisible = Math.floor(frame / 15) % 2 === 0;

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <div style={{ transform: `scale(${logoScale})`, opacity: logoScale }}>
        <CCLogo size={72} />
      </div>

      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 26,
          color: GREEN,
          opacity: urlOp,
          display: 'flex',
          alignItems: 'center',
          gap: 0,
        }}
      >
        clearchain.vercel.app
        <span style={{ opacity: cursorVisible && urlOp > 0.5 ? 1 : 0, marginLeft: 2 }}>|</span>
      </div>

      <div
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 18,
          color: TEXT2,
          opacity: subOp,
        }}
      >
        Free. Open source.
      </div>
    </AbsoluteFill>
  );
};

// ─── Root composition ──────────────────────────────────────────────────────────
export const ClearChainLaunch: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: "'Space Grotesk', sans-serif" }}>
      <NoiseBg frame={frame} />

      {/* Scene 1: 0–75 */}
      {frame < 75 && <Scene1 frame={frame} fps={fps} />}

      {/* Scene 2: 75–210 */}
      {frame >= 75 && frame < 210 && <Scene2 frame={frame} fps={fps} />}

      {/* Scene 3: 210–300 */}
      {frame >= 210 && frame < 300 && <Scene3 frame={frame} fps={fps} />}

      {/* Scene 4: 300–360 */}
      {frame >= 300 && <Scene4 frame={frame} fps={fps} />}
    </AbsoluteFill>
  );
};
