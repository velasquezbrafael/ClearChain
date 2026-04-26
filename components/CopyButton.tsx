'use client'

import { useState } from 'react'

export default function CopyButton({ text, style }: { text: string; style?: React.CSSProperties }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      style={{
        padding: '4px 10px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 3,
        color: copied ? '#00ff88' : '#3d4a5c',
        fontSize: 9,
        letterSpacing: '0.12em',
        cursor: 'pointer',
        fontFamily: 'var(--font-jetbrains-mono)',
        transition: 'color 0.15s',
        flexShrink: 0,
        ...style,
      }}
    >
      {copied ? 'COPIED' : 'COPY'}
    </button>
  )
}
