# Claude Code Task: Mobile QA Fix Pass — iOS/390px Viewport

Full QA pass of clearchain.vercel.app at 390×844px (iPhone 14 viewport). All issues are layout, visual, or UX — no data/API changes.

---

## Issue 1 — No mobile navigation (hamburger menu missing) [HIGH]

**Problem:** On mobile (`isMobile = true`), the DOCS and INTEL links are wrapped in `{!isMobile && (...)}` in the `<nav>` inside `app/page.tsx` (search for `DOCS` and `INTEL →` in the nav section). Mobile users have no way to reach `/docs` or `/intel`.

**Fix:** Add a simple hamburger menu for mobile. In the nav's right side `<div>` (after the `{!isMobile && ...}` block, alongside the sound toggle and sign-in button), add a mobile-only hamburger icon that toggles a dropdown:

```tsx
{/* Mobile hamburger — toggle state */}
{isMobile && (
  <>
    <button
      onClick={() => setMobileMenuOpen(prev => !prev)}
      style={{
        background: 'none',
        border: '1px solid rgba(6,182,212,0.15)',
        borderRadius: 3,
        padding: '6px 8px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
      aria-label="Menu"
    >
      {[0,1,2].map(i => (
        <div key={i} style={{ width: 16, height: 1.5, background: '#06b6d4' }} />
      ))}
    </button>

    {/* Dropdown menu */}
    {mobileMenuOpen && (
      <div
        style={{
          position: 'fixed',
          top: 'calc(56px + env(safe-area-inset-top))',
          left: 0,
          right: 0,
          background: 'rgba(0,8,15,0.97)',
          borderBottom: '1px solid rgba(6,182,212,0.1)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          zIndex: 49,
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
        onClick={() => setMobileMenuOpen(false)}
      >
        {[
          { href: '/docs', label: 'DOCS' },
          { href: '/intel', label: 'INTEL' },
          { href: '/dashboard', label: 'DASHBOARD' },
        ].map(link => (
          <a
            key={link.href}
            href={link.href}
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 13,
              letterSpacing: '0.12em',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              padding: '14px 0',
              borderBottom: '1px solid rgba(6,182,212,0.05)',
              display: 'block',
            }}
          >
            {link.label}
          </a>
        ))}
      </div>
    )}
  </>
)}
```

Add `mobileMenuOpen` state: `const [mobileMenuOpen, setMobileMenuOpen] = useState(false);`

Also close the menu on route change / escape key.

---

## Issue 2 — WaitlistBar: Replace with GitHub star CTA [HIGH]

**Problem:** `components/WaitlistBar.tsx` shows a "Stay in the loop — subscribe" email capture form. There is no subscription product — this form is confusing and creates a large dead-space on the homepage (it's off-brand, uses old `#00ff88` green accent instead of the `#06b6d4` cyan design system, and collects emails with no defined purpose).

**Fix:** Replace `WaitlistBar.tsx` entirely. New component should be a lightweight social proof / GitHub CTA strip. Replace the entire content of `WaitlistBar.tsx` with:

```tsx
'use client';

import React from 'react';

export default function WaitlistBar() {
  return (
    <div
      style={{
        padding: '28px 24px',
        borderTop: '1px solid rgba(6,182,212,0.06)',
        borderBottom: '1px solid rgba(6,182,212,0.06)',
        background: '#080b14',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px 32px',
      }}
    >
      {/* Label */}
      <span
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 11,
          letterSpacing: '0.12em',
          color: '#1e4d5c',
        }}
      >
        FREE · OPEN SOURCE · NO ACCOUNT REQUIRED
      </span>

      {/* GitHub CTA */}
      <a
        href="https://github.com/velasquezbrafael-source/ClearChain"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 16px',
          background: 'rgba(6,182,212,0.06)',
          border: '1px solid rgba(6,182,212,0.15)',
          borderRadius: 3,
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 11,
          letterSpacing: '0.08em',
          color: '#06b6d4',
          textDecoration: 'none',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(6,182,212,0.4)';
          (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(6,182,212,0.1)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(6,182,212,0.15)';
          (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(6,182,212,0.06)';
        }}
      >
        {/* GitHub icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
        </svg>
        ★ Star on GitHub
      </a>

      {/* X/Twitter CTA */}
      <a
        href="https://x.com/search?q=ClearChain"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 11,
          letterSpacing: '0.08em',
          color: '#3d4a5c',
          textDecoration: 'none',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#8892a4'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#3d4a5c'; }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.736-8.85L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
        @ClearChain
      </a>
    </div>
  );
}
```

Also **delete** `/api/waitlist/join/route.ts` if it exists (no longer needed), and remove the `waitlist` Supabase table if desired (optional cleanup).

---

## Issue 3 — "Why ClearChain" comparison grid: transparent cells look like voids on mobile [HIGH]

**Problem:** In the "Why ClearChain" section (`app/page.tsx`, search for `gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr'`), the comparison grid alternates between glass (left) cells and transparent (right) cells. On mobile, the grid collapses to 1 column, causing them to stack. The transparent right-side cells have a nearly-invisible border (`rgba(6,182,212,0.08)`) against the dark `#03040a` page background — they look like blank voids (~585px gap effect).

**Fix:** On mobile, give the transparent "right" cells a subtle visible treatment. Change the right-side cell's style to add `background: 'rgba(6,182,212,0.02)'` when on mobile, and increase border opacity:

```tsx
// RIGHT cells — change this:
<div key={`right-${i}`} style={{
  padding: isMobile ? '20px 20px' : '28px 32px',
  border: '1px solid rgba(6,182,212,0.08)',
  background: 'transparent'
}}>

// TO this:
<div key={`right-${i}`} style={{
  padding: isMobile ? '20px 20px' : '28px 32px',
  border: `1px solid ${isMobile ? 'rgba(6,182,212,0.12)' : 'rgba(6,182,212,0.08)'}`,
  background: isMobile ? 'rgba(6,182,212,0.02)' : 'transparent',
  borderTop: isMobile ? 'none' : undefined,
}}>
```

Also add `gap: isMobile ? 0 : 0` to the grid container and consider adding `borderTop: 'none'` on the right cells on mobile to avoid double-borders between stacked cells.

---

## Issue 4 — "Enterprise tools start at $50,000/year" — confusing messaging [MEDIUM]

**Problem:** At the bottom of the comparison table (line ~4039 in `app/page.tsx`, search for `Enterprise tools start at`), the text reads: "Enterprise tools start at $50,000/year. ClearChain is free to start." This creates confusion — it implies ClearChain may have paid tiers, and positions it as a stripped-down enterprise tool.

**Fix:** Change the copy to something cleaner:

```tsx
// Change:
Enterprise tools start at $50,000/year.{' '}
ClearChain is{' '}
<span style={{ color: '#00ff88' }}>free to start</span>.

// To:
Chainalysis costs $50,000+/year. ClearChain is{' '}
<span style={{ color: '#06b6d4' }}>always free</span>.
```

Also update the color from `#00ff88` (old green) to `#06b6d4` (cyan, current design system).

---

## Issue 5 — Hero section bottom padding on mobile creates gap before WaitlistBar [MEDIUM]

**Problem:** On mobile (≤640px), `.hero-left` has `padding: 64px 16px 32px` (bottom: 32px). Combined with the WaitlistBar's `padding: '40px 32px'` top (currently, before replacement), there's roughly 72px of blank space between the last hero element (TRY AN EXAMPLE box) and the next visible section. After replacing WaitlistBar per Issue 2, this may still feel spacious. The hero bottom padding can safely be reduced on mobile.

**Fix:** In `app/globals.css`, reduce mobile hero-left bottom padding:

```css
/* Change: */
@media (max-width: 640px) {
  .hero-left  { padding: 64px 16px 32px; }
}

/* To: */
@media (max-width: 640px) {
  .hero-left  { padding: 64px 16px 20px; }
}
```

---

## Issue 6 — How it works grid: stat cards have no mobile gap [LOW]

**Problem:** The how-it-works 3-card grid (`className="how-it-works-grid"`) correctly collapses to 1-col on mobile via CSS, but the grid has `gap: 16` which applies. This is fine. However, the grid container uses `gridTemplateColumns: 'repeat(3, 1fr)'` inline — the CSS override switches it to `1fr`. This works. No action needed if testing confirms it looks fine.

**Verify only:** At 390px viewport, confirm the 3 cards stack vertically with visible separation.

---

## After making all changes:

1. Run `npm run dev`
2. Open Chrome DevTools → Device Toolbar → iPhone 14 (390×844)
3. Verify hamburger menu opens/closes and all 3 links work
4. Verify the new WaitlistBar strip is compact and on-brand (no email form)
5. Verify "Why ClearChain" comparison rows all have visible cell backgrounds
6. Verify "Chainalysis costs $50,000+/year" copy renders correctly
7. Scroll full page at 390px — confirm no large blank voids remain
8. Test at 768px — confirm hamburger still shows (isMobile threshold check)
