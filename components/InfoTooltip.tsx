'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface InfoTooltipProps {
  text: string;
}

export default function InfoTooltip({ text }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, showBelow: false, arrowOffset: 0 });
  const [mounted, setMounted] = useState(false);
  const iconRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  function show() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      const TOOLTIP_MAX_W = 280;
      const TOOLTIP_APPROX_H = 80;
      const MARGIN = 10;

      // Centre the tooltip on the icon
      let left = rect.left + rect.width / 2;
      // Clamp so tooltip doesn't bleed off either edge
      const minLeft = TOOLTIP_MAX_W / 2 + MARGIN;
      const maxLeft = window.innerWidth - TOOLTIP_MAX_W / 2 - MARGIN;
      const clampedLeft = Math.max(minLeft, Math.min(left, maxLeft));
      // Track how far we had to shift so the arrow still points at the icon
      const arrowOffset = left - clampedLeft;

      // Flip below if not enough room above
      const showBelow = rect.top < TOOLTIP_APPROX_H + MARGIN;

      setPos({ top: rect.top, left: clampedLeft, showBelow, arrowOffset });
    }
    setVisible(true);
  }

  function hide() {
    timerRef.current = setTimeout(() => setVisible(false), 80);
  }

  const tooltip = mounted && visible
    ? createPortal(
        <div
          style={{
            position: 'fixed',
            top: pos.showBelow ? pos.top + 20 : pos.top,
            left: pos.left,
            transform: pos.showBelow
              ? 'translateX(-50%)'
              : 'translateX(-50%) translateY(calc(-100% - 10px))',
            background: '#001f2e',
            border: '1px solid rgba(6,182,212,0.25)',
            borderRadius: 4,
            padding: '10px 14px',
            maxWidth: 280,
            width: 'max-content',
            zIndex: 9999,
            pointerEvents: 'none',
            animation: 'tooltipFadeIn 0.12s ease-out both',
          }}
        >
          {/* Arrow — offset-corrected to always point at icon */}
          <div
            style={{
              position: 'absolute',
              ...(pos.showBelow
                ? { top: -5, bottom: 'auto' }
                : { bottom: -5, top: 'auto' }),
              left: `calc(50% + ${pos.arrowOffset}px)`,
              transform: 'translateX(-50%) rotate(45deg)',
              width: 8,
              height: 8,
              background: '#001f2e',
              border: '1px solid rgba(6,182,212,0.25)',
              ...(pos.showBelow
                ? { borderBottom: 'none', borderRight: 'none' }
                : { borderTop: 'none', borderLeft: 'none' }),
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
        </div>,
        document.body
      )
    : null;

  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <span
        ref={iconRef}
        aria-label="More information"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: `1px solid ${visible ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.15)'}`,
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 9,
          color: visible ? '#06b6d4' : 'var(--text-dim)',
          cursor: 'default',
          lineHeight: 1,
          userSelect: 'none',
          transition: 'border-color 0.15s, color 0.15s',
          flexShrink: 0,
        }}
      >
        i
      </span>
      {tooltip}
    </span>
  );
}
