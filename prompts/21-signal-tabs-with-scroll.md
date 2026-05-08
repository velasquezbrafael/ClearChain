# Task 21 — Signal Detail: Tabs + Capped Scroll

## Context

`app/page.tsx` — the `SignalDetailSection` component now uses tabs (one per triggered signal). The active signal's detail text renders below the tab strip. When the detail text is long (e.g. Indirect Exposure listing 4 OFAC addresses), it still stretches the panel too tall.

Fix: keep the tabs exactly as-is, but cap the detail text area at a fixed height with overflow scroll. The scroll UX must be clean — no jarring pill overlapping text. The fade gradient approach from last time was close but the pill felt clunky. This time: fade only, no pill, plus a small arrow indicator in the bottom-right corner of the container that disappears when fully scrolled.

---

## Design System

```
Background:   #080b14 (card)
Accent cyan:  #06b6d4
Borders:      rgba(255,255,255,0.06)
Text:         #8892a4 secondary (detail body)
Fonts:        system-ui (detail body text)
Rules:        No border-radius > 4px. No icon libraries. Inline SVG only.
```

---

## What to Change

**File:** `app/page.tsx`

Find the `SignalDetailSection` function. The tabs strip and tab switching logic stay **completely unchanged**. Only modify the detail text rendering block at the bottom of the function.

Replace the `{/* Active tab detail text */}` `<p>` block with this scrollable wrapper:

```tsx
{/* Scrollable detail text */}
<div style={{ position: 'relative' }}>
  <style>{`
    .signal-scroll::-webkit-scrollbar { width: 2px; }
    .signal-scroll::-webkit-scrollbar-track { background: transparent; }
    .signal-scroll::-webkit-scrollbar-thumb { background: rgba(6,182,212,0.2); border-radius: 2px; }
  `}</style>

  <div
    ref={scrollRef}
    className="signal-scroll"
    style={{
      maxHeight: 140,
      overflowY: 'auto',
      scrollbarWidth: 'thin',
      scrollbarColor: 'rgba(6,182,212,0.2) transparent',
      paddingRight: 8,
      paddingBottom: showMore ? 16 : 0,
    }}
  >
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

  {/* Fade gradient — only when more content below */}
  {showMore && (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 36,
        background: 'linear-gradient(to bottom, transparent, #080b14)',
        pointerEvents: 'none',
      }}
    />
  )}

  {/* Scroll arrow — bottom right, disappears when fully scrolled */}
  {showMore && (
    <div
      style={{
        position: 'absolute',
        bottom: 4,
        right: 10,
        pointerEvents: 'none',
        opacity: 0.35,
      }}
    >
      <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
        <path d="M1 1L5 5L9 1" stroke="#06b6d4" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )}
</div>
```

Add the scroll state hooks at the top of the `SignalDetailSection` function (alongside the existing `activeTab` state):

```tsx
const scrollRef = React.useRef<HTMLDivElement>(null);
const [showMore, setShowMore] = React.useState(false);

// Reset scroll position and recheck when active tab changes
React.useEffect(() => {
  const el = scrollRef.current;
  if (!el) return;
  el.scrollTop = 0;
  const check = () => {
    setShowMore(el.scrollHeight > el.clientHeight + 4);
  };
  check();
  el.addEventListener('scroll', () => {
    setShowMore(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  });
  return () => el.removeEventListener('scroll', () => {});
}, [activeTab]);
```

**Important:** The `showMore` check uses `el.scrollHeight > el.clientHeight + 4` (not just greater-than) to avoid false positives from sub-pixel rounding. The scroll listener uses `scrollTop + clientHeight < scrollHeight - 4` so the arrow disappears just before the very bottom, not only exactly at it — gives a better felt sense of "I've seen it all."

---

## What NOT to change

- The tab strip (buttons, active state, `setActiveTab`) — leave completely untouched
- The active tab label (`formatSignalName` div above the detail)
- The signal list rows above the detail section
- Any other component in the file

---

## Dev Command

```bash
npm run dev
```
