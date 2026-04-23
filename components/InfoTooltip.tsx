'use client';

import { useState, useRef } from 'react';

interface InfoTooltipProps {
  text: string;
}

export default function InfoTooltip({ text }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(true);
  }

  function hide() {
    timerRef.current = setTimeout(() => setVisible(false), 80);
  }

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {/* ⓘ circle */}
      <span
        aria-label="More information"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.15)',
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 9,
          color: 'var(--text-dim)',
          cursor: 'default',
          lineHeight: 1,
          userSelect: 'none',
          transition: 'border-color 0.15s, color 0.15s',
          ...(visible ? { borderColor: 'rgba(0,255,136,0.4)', color: '#00ff88' } : {}),
        }}
      >
        i
      </span>

      {/* Tooltip */}
      {visible && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 8,
            background: '#0d1220',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            padding: '10px 14px',
            maxWidth: 280,
            width: 'max-content',
            zIndex: 200,
            pointerEvents: 'none',
          }}
        >
          {/* Arrow */}
          <div
            style={{
              position: 'absolute',
              bottom: -5,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 8,
              height: 8,
              background: '#0d1220',
              border: '1px solid rgba(255,255,255,0.1)',
              borderTop: 'none',
              borderLeft: 'none',
              rotate: '45deg',
            }}
          />
          <p
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            {text}
          </p>
        </div>
      )}
    </span>
  );
}
