'use client'

import { useState } from 'react'

export interface CodeTab {
  label: string
  code: string
}

export default function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(tabs[active].code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        background: '#080b14',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => { setActive(i); setCopied(false) }}
            style={{
              padding: '10px 18px',
              background: 'none',
              border: 'none',
              borderBottom: active === i ? '2px solid #00ff88' : '2px solid transparent',
              marginBottom: -1,
              color: active === i ? '#f0f4ff' : '#3d4a5c',
              fontSize: 11,
              letterSpacing: '0.1em',
              cursor: 'pointer',
              fontFamily: 'var(--font-jetbrains-mono)',
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
        {/* Spacer + copy button */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 14 }}>
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
            }}
          >
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </div>
      </div>

      {/* Code */}
      <pre style={{
        margin: 0,
        padding: '20px 24px',
        background: '#080b14',
        fontFamily: 'var(--font-jetbrains-mono)',
        fontSize: 13,
        color: '#f0f4ff',
        lineHeight: 1.7,
        overflowX: 'auto',
      }}>
        {tabs[active].code}
      </pre>
    </div>
  )
}
