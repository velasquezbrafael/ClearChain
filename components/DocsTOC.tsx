'use client';

import { useEffect, useState } from 'react';

const SECTIONS = [
  { id: 'scoring',     label: 'Risk Scores',         num: '01' },
  { id: 'typologies',  label: 'Risk Patterns',        num: '02' },
  { id: 'attribution', label: 'Wallet Attribution',   num: '03' },
  { id: 'sources',     label: 'Our Data',             num: '04' },
  { id: 'sar',         label: 'SAR Drafts',           num: '05' },
];

export default function DocsTOC() {
  const [active, setActive] = useState('scoring');

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        // Pick the topmost visible section
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActive(visible[0].target.id);
      },
      { rootMargin: '-10% 0px -60% 0px', threshold: 0 }
    );

    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <nav
      style={{
        position: 'sticky',
        top: 88,
        alignSelf: 'flex-start',
        width: 200,
        flexShrink: 0,
        paddingTop: 8,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 9,
          letterSpacing: '0.2em',
          color: '#1e4d5c',
          marginBottom: 20,
          paddingBottom: 12,
          borderBottom: '1px solid rgba(6,182,212,0.06)',
        }}
      >
        ON THIS PAGE
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {SECTIONS.map(s => {
          const isActive = active === s.id;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 3,
                textDecoration: 'none',
                background: isActive ? 'rgba(6,182,212,0.06)' : 'transparent',
                borderLeft: `2px solid ${isActive ? '#06b6d4' : 'transparent'}`,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                if (!isActive) (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(6,182,212,0.03)';
              }}
              onMouseLeave={e => {
                if (!isActive) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 9,
                  color: isActive ? '#06b6d4' : '#1e4d5c',
                  flexShrink: 0,
                  transition: 'color 0.15s',
                }}
              >
                {s.num}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 11,
                  color: isActive ? '#06b6d4' : '#3d4a5c',
                  letterSpacing: '0.04em',
                  transition: 'color 0.15s',
                }}
              >
                {s.label}
              </span>
            </a>
          );
        })}
      </div>

      {/* Back to top */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        style={{
          marginTop: 28,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 10px',
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 9,
          letterSpacing: '0.12em',
          color: '#1e4d5c',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#06b6d4'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#1e4d5c'; }}
      >
        ↑ BACK TO TOP
      </button>
    </nav>
  );
}
