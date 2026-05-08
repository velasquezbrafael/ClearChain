# Task 19 — Signal Detail Scroll + Overflow Indicator

## Context

In `app/page.tsx`, the signal breakdown panel has a desktop-only detail section (lines ~480–519) that renders plain-English explanations for each triggered signal. When multiple signals fire (e.g. OFAC + Mixer + Indirect Exposure), the detail text grows very tall and stretches the entire layout.

The fix: cap the detail section at a fixed height, make it scrollable, add a bottom fade gradient that disappears when fully scrolled, and show a "MORE ↓" pill when there's clipped content.

---

## Design System

```
Background:   #080b14 (card interior)
Accent cyan:  #06b6d4
Borders:      rgba(255,255,255,0.06)
Text:         #f0f4ff primary, #8892a4 secondary, #3d4a5c dim
Fonts:        JetBrains Mono (labels), system-ui (body)
Rules:        No border-radius > 4px. No icon libraries. Inline SVG only.
```

---

## What to Change

**File:** `app/page.tsx`

Find the desktop-only detail section — it looks like this:

```tsx
{/* Detail section — desktop only */}
{!isMobile && sorted.filter(s => s.triggered && s.detail).length > 0 && (
  <div
    style={{
      marginTop: 20,
      paddingTop: 16,
      borderTop: '1px solid rgba(6,182,212,0.05)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}
  >
    {sorted.filter(s => s.triggered && s.detail).map(signal => (
      ...
    ))}
  </div>
)}
```

Replace this entire block with the following updated version:

```tsx
{/* Detail section — desktop only */}
{!isMobile && sorted.filter(s => s.triggered && s.detail).length > 0 && (
  <SignalDetailSection signals={sorted.filter(s => s.triggered && s.detail)} />
)}
```

Then define `SignalDetailSection` as a new inner component (place it just above the `SignalBreakdown` function or inside the same file scope):

```tsx
function SignalDetailSection({ signals }: { signals: ScoringSignal[] }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = React.useState(false);
  const [canScroll, setCanScroll] = React.useState(false);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setCanScroll(el.scrollHeight > el.clientHeight);
      setIsScrolled(el.scrollTop + el.clientHeight >= el.scrollHeight - 8);
    };
    check();
    el.addEventListener('scroll', check);
    window.addEventListener('resize', check);
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [signals]);

  const showMore = canScroll && !isScrolled;

  return (
    <div
      style={{
        marginTop: 20,
        paddingTop: 16,
        borderTop: '1px solid rgba(6,182,212,0.05)',
        position: 'relative',
      }}
    >
      {/* Scrollable content */}
      <div
        ref={scrollRef}
        style={{
          maxHeight: 220,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          paddingRight: 4,
          /* Thin scrollbar */
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(6,182,212,0.15) transparent',
        }}
      >
        {signals.map(signal => (
          <div key={signal.name}>
            <div
              style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 9,
                letterSpacing: '0.1em',
                color: 'var(--text-dim)',
                marginBottom: 3,
              }}
            >
              {formatSignalName(signal.name)}
            </div>
            <p
              style={{
                fontFamily: 'var(--font-inter)',
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {signal.detail}
            </p>
          </div>
        ))}
      </div>

      {/* Bottom fade gradient — only when more content exists */}
      {showMore && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 48,
            background: 'linear-gradient(to bottom, transparent, #080b14)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* MORE ↓ pill */}
      {showMore && (
        <div
          style={{
            position: 'absolute',
            bottom: 6,
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 8,
            letterSpacing: '0.15em',
            color: 'rgba(6,182,212,0.5)',
            background: 'rgba(6,182,212,0.06)',
            border: '1px solid rgba(6,182,212,0.12)',
            borderRadius: 2,
            padding: '3px 8px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          MORE ↓
        </div>
      )}
    </div>
  );
}
```

---

## Notes

- `ScoringSignal` is already imported/available in scope — the function receives the already-filtered list
- `formatSignalName` is already defined in the file — reference it directly
- `React.useRef` and `React.useEffect` and `React.useState` are available — import React at the top if not already a default import (check first)
- The `maxHeight: 220` gives roughly 3 signal detail blocks before clipping — adjust to 200 or 240 if it looks off visually
- The `scrollbarColor` CSS only applies in Firefox; Chrome uses `::-webkit-scrollbar` pseudo-elements — adding a `<style>` tag for webkit scrollbar styling is optional but nice to have:
  ```tsx
  <style>{`
    .signal-detail-scroll::-webkit-scrollbar { width: 3px; }
    .signal-detail-scroll::-webkit-scrollbar-track { background: transparent; }
    .signal-detail-scroll::-webkit-scrollbar-thumb { background: rgba(6,182,212,0.15); border-radius: 2px; }
  `}</style>
  ```
  If adding this, give the scroll div `className="signal-detail-scroll"` in addition to the inline styles.
- Do NOT change any other part of the signal breakdown panel — only the detail section is affected

---

## Dev Command

```bash
npm run dev
```
