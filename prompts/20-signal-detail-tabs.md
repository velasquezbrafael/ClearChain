# Task 20 — Signal Detail Tabs

## Context

In `app/page.tsx`, the `SignalDetailSection` component currently shows all triggered signal detail texts in a scrollable container with a fade/MORE pill. The user wants to replace this with tabbed navigation — one tab per triggered signal, clicking a tab swaps the visible detail text. No scrolling needed.

## Design System

```
Background:   #080b14 (card) / #0d1220 (active tab bg)
Accent cyan:  #06b6d4
Borders:      rgba(255,255,255,0.06) default, rgba(6,182,212,0.2) active
Text:         #f0f4ff primary, #8892a4 secondary, #3d4a5c dim
Fonts:        JetBrains Mono (tabs/labels), system-ui (detail body text)
Rules:        No border-radius > 4px. No icon libraries.
```

## What to Change

**File:** `app/page.tsx`

Replace the entire `SignalDetailSection` function with this new version:

```tsx
function SignalDetailSection({ signals }: { signals: ScoringSignal[] }) {
  const [activeTab, setActiveTab] = React.useState(0);

  if (signals.length === 0) return null;

  const active = signals[activeTab] ?? signals[0];

  return (
    <div
      style={{
        marginTop: 20,
        paddingTop: 16,
        borderTop: '1px solid rgba(6,182,212,0.05)',
      }}
    >
      {/* Tab strip */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        {signals.map((signal, i) => {
          const isActive = i === activeTab;
          return (
            <button
              key={signal.name}
              onClick={() => setActiveTab(i)}
              style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 8,
                letterSpacing: '0.12em',
                padding: '4px 8px',
                background: isActive ? 'rgba(6,182,212,0.08)' : 'transparent',
                border: `1px solid ${isActive ? 'rgba(6,182,212,0.25)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 2,
                color: isActive ? '#06b6d4' : '#3d4a5c',
                cursor: 'pointer',
                transition: 'all 0.12s',
                whiteSpace: 'nowrap',
              }}
            >
              {formatSignalName(active.name === signal.name ? signal.name : signal.name)}
            </button>
          );
        })}
      </div>

      {/* Active tab label */}
      <div
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 9,
          letterSpacing: '0.1em',
          color: 'var(--text-dim)',
          marginBottom: 6,
        }}
      >
        {formatSignalName(active.name)}
      </div>

      {/* Active tab detail text */}
      <p
        style={{
          fontFamily: 'var(--font-inter)',
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {active.detail}
      </p>
    </div>
  );
}
```

Also remove the inline `<style>` tag for `.signal-detail-scroll` webkit scrollbar overrides that was added in the previous task — it's no longer needed.

## Notes

- `formatSignalName` is already defined in the file — use it directly for tab labels
- `ScoringSignal` type is already in scope
- Default active tab is index 0 (first triggered signal)
- Tab labels should use `formatSignalName` — e.g. "OFAC MATCH", "MIXER INTERACTION", "INDIRECT EXPOSURE"
- No scroll, no fade gradient, no MORE pill — remove all of that
- The rest of the signal panel (signal list rows, dots, scores) is untouched

## Dev Command

```bash
npm run dev
```
