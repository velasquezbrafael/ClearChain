'use client';

import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Terminal log lines per step — each array streams in sequentially
// ---------------------------------------------------------------------------

const STEP_LINES: string[][] = [
  // Step 0 — Fetching transactions
  [
    '> initializing analysis pipeline...',
    '> connecting to blockchain RPC...',
    '> fetching on-chain transaction history...',
    '> fetching token transfer records...',
    '> transactions retrieved [OK]',
  ],
  // Step 1 — OFAC check
  [
    '> loading OFAC SDN master list...',
    '> cross-referencing 12,400+ sanctioned addresses...',
    '> checking known mixer & darknet market addresses...',
    '> sanctions check complete [OK]',
  ],
  // Step 2 — Scoring
  [
    '> initializing 6-signal risk scoring engine...',
    '> signal: ofac_match',
    '> signal: mixer_interaction',
    '> signal: rapid_fund_movement',
    '> signal: high_risk_counterparty',
    '> signal: volume_anomaly',
    '> signal: community_red_flags',
    '> computing weighted risk score [OK]',
  ],
  // Step 3 — AI narrative
  [
    '> invoking Claude Haiku LLM...',
    '> generating compliance narrative...',
    '> drafting BSA-formatted SAR template...',
    '> narrative complete [OK]',
  ],
];

const LINE_DELAY = 120;   // ms between lines within a step
const CHAR_DELAY = 18;    // ms per character typewriter speed

// ---------------------------------------------------------------------------
// Single line with typewriter effect
// ---------------------------------------------------------------------------

function TerminalLine({
  text,
  onComplete,
  instant,
}: {
  text: string;
  onComplete?: () => void;
  instant?: boolean;
}) {
  const [displayed, setDisplayed] = useState(instant ? text : '');
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (instant) { setDisplayed(text); onComplete?.(); return; }
    let i = 0;
    function tick() {
      i++;
      setDisplayed(text.slice(0, i));
      if (i < text.length) {
        rafRef.current = setTimeout(tick, CHAR_DELAY);
      } else {
        onComplete?.();
      }
    }
    rafRef.current = setTimeout(tick, CHAR_DELAY);
    return () => { if (rafRef.current) clearTimeout(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOk     = text.endsWith('[OK]');
  const isSignal = text.startsWith('> signal:');
  const isInit   = text.startsWith('> initializing') || text.startsWith('> invoking') || text.startsWith('> connecting');

  const color = isOk
    ? '#00ff88'
    : isSignal
    ? '#7ec8d8'
    : isInit
    ? '#06b6d4'
    : 'rgba(200,240,255,0.75)';

  return (
    <div style={{
      fontFamily: 'var(--font-jetbrains-mono)',
      fontSize: 12,
      lineHeight: 1.8,
      color,
      letterSpacing: '0.02em',
      whiteSpace: 'pre',
    }}>
      {displayed}
      {displayed.length < text.length && (
        <span style={{ animation: 'termCursor 0.7s step-end infinite', color: '#06b6d4' }}>█</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main TerminalLoader
// ---------------------------------------------------------------------------

interface TerminalLoaderProps {
  step: number;       // current step index (0-based, from parent)
  steps: string[];    // step labels (used for progress bar only)
  address?: string;   // address being analyzed (shown in header)
  chain?: string;
  isMobile?: boolean;
}

export default function TerminalLoader({
  step,
  steps,
  address,
  chain,
  isMobile,
}: TerminalLoaderProps) {
  // lines[] is the full running history — append-only
  const [lines, setLines] = useState<string[]>([]);
  const [currentLineIdx, setCurrentLineIdx] = useState(0); // within the current step's lines
  const [currentStep, setCurrentStep] = useState(-1);
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  // When step advances, enqueue the new step's lines
  useEffect(() => {
    if (step === currentStep) return;
    setCurrentStep(step);
    setCurrentLineIdx(0);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stream lines for the current step
  useEffect(() => {
    if (currentStep < 0) return;
    const stepLines = STEP_LINES[currentStep];
    if (!stepLines) return;
    if (currentLineIdx >= stepLines.length) return;

    const line = stepLines[currentLineIdx];
    // delay before revealing next line
    const t = setTimeout(() => {
      setLines(prev => [...prev, line]);
    }, currentLineIdx === 0 ? 0 : LINE_DELAY);

    return () => clearTimeout(t);
  }, [currentStep, currentLineIdx]);

  // Advance to next line after the current one finishes typewriting
  function onLineComplete() {
    setCurrentLineIdx(prev => prev + 1);
  }

  const pct = Math.round(((step + 1) / steps.length) * 100);

  return (
    <div style={{ padding: isMobile ? '24px 0' : '32px 0', animation: 'fadeSlideUp 0.3s ease-out both' }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        background: '#000d18',
        border: '1px solid rgba(6,182,212,0.12)',
        borderBottom: 'none',
        borderRadius: '4px 4px 0 0',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Traffic lights */}
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(255,59,59,0.4)', display: 'inline-block' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(255,200,0,0.4)', display: 'inline-block' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(0,255,136,0.4)', display: 'inline-block' }} />
          <span style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            color: '#1e4d5c',
            letterSpacing: '0.12em',
            marginLeft: 8,
          }}>
            CLEARCHAIN — ANALYSIS PIPELINE
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {address && (
            <span style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 10,
              color: '#06b6d4',
              letterSpacing: '0.06em',
              maxWidth: isMobile ? 120 : 240,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {address}
            </span>
          )}
          {chain && (
            <span style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 9,
              letterSpacing: '0.15em',
              color: '#1e4d5c',
              border: '1px solid rgba(6,182,212,0.12)',
              padding: '2px 6px',
              borderRadius: 2,
            }}>
              {chain}
            </span>
          )}
        </div>
      </div>

      {/* Terminal body */}
      <div style={{
        background: '#000d18',
        border: '1px solid rgba(6,182,212,0.12)',
        borderTop: '1px solid rgba(6,182,212,0.06)',
        borderBottom: 'none',
        padding: isMobile ? '16px 14px' : '20px 24px',
        minHeight: isMobile ? 160 : 200,
        maxHeight: isMobile ? 220 : 280,
        overflowY: 'auto',
        scrollbarWidth: 'none',
      }}>
        <style>{`
          @keyframes termCursor { 0%,100%{opacity:1} 50%{opacity:0} }
        `}</style>

        {/* Boot line */}
        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12, color: '#1e4d5c', marginBottom: 8, letterSpacing: '0.04em' }}>
          ClearChain Intelligence Engine v3.4 — ready
        </div>

        {lines.map((line, i) => {
          const isLast = i === lines.length - 1;
          const isCurrentStep = currentStep >= 0 && STEP_LINES[currentStep]?.includes(line);
          // Lines from completed steps render instantly (no typewriter re-animation)
          const instant = !isLast || !isCurrentStep;
          return (
            <TerminalLine
              key={`${i}-${line}`}
              text={line}
              instant={instant}
              onComplete={isLast ? onLineComplete : undefined}
            />
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Progress bar */}
      <div style={{
        background: '#000d18',
        border: '1px solid rgba(6,182,212,0.12)',
        borderTop: '1px solid rgba(6,182,212,0.04)',
        padding: '10px 24px 12px',
        borderRadius: '0 0 4px 4px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.15em', color: '#1e4d5c' }}>
            {steps[step] ?? 'PROCESSING...'}
          </span>
          <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, color: '#06b6d4' }}>
            {pct}%
          </span>
        </div>
        <div style={{ height: 2, background: 'rgba(6,182,212,0.08)', borderRadius: 1, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: 'linear-gradient(to right, #06b6d4, #00ff88)',
            borderRadius: 1,
            transition: 'width 0.6s ease',
            boxShadow: '0 0 8px rgba(0,255,136,0.4)',
          }} />
        </div>
      </div>

      {/* Skeleton placeholders below — layout preview while terminal runs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '280px 1fr 280px',
        gap: 24,
        marginTop: 24,
        alignItems: 'start',
      }}>
        {/* Col 1 — score skeleton */}
        {!isMobile && (
          <div style={{ border: '1px solid rgba(6,182,212,0.08)', borderRadius: 4, background: '#001824', padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[80, 120, 100, 28, '100%', '85%', '70%'].map((w, i) => (
              <div key={i} className="skeleton" style={{ width: typeof w === 'number' ? w : w, height: i === 2 ? 100 : i === 3 ? 28 : 12, borderRadius: 2 }} />
            ))}
          </div>
        )}

        {/* Col 2 — graph skeleton */}
        <div style={{ border: '1px solid rgba(6,182,212,0.08)', borderRadius: 4, background: '#001824', overflow: 'hidden', minHeight: isMobile ? 240 : 460, position: 'relative' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(6,182,212,0.05)' }}>
            <div className="skeleton" style={{ width: 140, height: 12, borderRadius: 2 }} />
          </div>
          <div className="skeleton" style={{ position: 'absolute', inset: 0, top: 48, borderRadius: 0 }} />
          <div style={{ position: 'absolute', inset: 0, top: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: 200, height: 200 }}>
              {[
                { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', w: 40, delay: '0s', border: true },
                { top: 10, left: 10, w: 24, delay: '0.3s' },
                { top: 10, right: 10, w: 18, delay: '0.6s' },
                { bottom: 10, left: 20, w: 20, delay: '0.9s' },
                { bottom: 10, right: 20, w: 16, delay: '1.2s' },
              ].map((n, i) => (
                <div key={i} style={{
                  position: 'absolute', borderRadius: '50%',
                  width: n.w, height: n.w,
                  top: n.top, left: (n as {left?: number|string}).left, right: (n as {right?: number}).right, bottom: (n as {bottom?: number}).bottom,
                  transform: (n as {transform?: string}).transform,
                  background: (n as {border?: boolean}).border ? undefined : '#001f2e',
                  border: (n as {border?: boolean}).border ? '1px solid rgba(6,182,212,0.15)' : undefined,
                  animation: `pulseGlow 2s infinite ${n.delay}`,
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* Col 3 — signals skeleton */}
        {!isMobile && (
          <div style={{ border: '1px solid rgba(6,182,212,0.08)', borderRadius: 4, background: '#001824', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="skeleton" style={{ width: 80, height: 10, borderRadius: 2 }} />
            {[100, 85, 95, 70, 80, 65].map((w, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="skeleton" style={{ width: 8, height: 8, borderRadius: 2 }} />
                <div className="skeleton" style={{ width: `${w}%`, height: 11, borderRadius: 2 }} />
                <div className="skeleton" style={{ width: 28, height: 11, borderRadius: 2 }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
