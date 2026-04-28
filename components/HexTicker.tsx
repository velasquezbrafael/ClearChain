'use client';

import React from 'react';

function genHexBytes(): string[] {
  return Array.from({ length: 80 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase(),
  );
}

export default function HexTicker() {
  const [bytes, setBytes] = React.useState<string[]>(genHexBytes);
  const line = bytes.join(' ');
  return (
    <div
      style={{
        overflow: 'hidden',
        height: 28,
        borderTop: '1px solid rgba(6,182,212,0.06)',
        borderBottom: '1px solid rgba(6,182,212,0.06)',
      }}
    >
      <div
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          animation: 'hexScroll 40s linear infinite',
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 10,
          color: 'rgba(6,182,212,0.18)',
          letterSpacing: '0.08em',
          lineHeight: '28px',
          userSelect: 'none',
        }}
        onAnimationIteration={() => setBytes(genHexBytes())}
      >
        {line}&nbsp;&nbsp;&nbsp;{line}
      </div>
    </div>
  );
}
