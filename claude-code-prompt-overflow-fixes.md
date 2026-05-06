# Claude Code Task: Fix Hero Panel Overflow + Site-Wide Layout Overflow Audit

## The Core Bug

In `app/globals.css`, `.hero-section` has `min-height: 540px` but `.hero-right` is `position: absolute` with `top: 80px` and `bottom: 60px`. The right panel content (3 wallet cards + RUN THE SIMULATOR + chain selector) needs ~640px of height. Result: the right panel bleeds out of the hero section at typical viewport heights.

### Fix in `app/globals.css`:

```css
/* Change this: */
.hero-section {
  position: relative;
  display: block;
  min-height: 540px;
}

/* To this: */
.hero-section {
  position: relative;
  display: block;
  min-height: 720px;
}
```

Also add `overflow-y: auto` to `.hero-right` as a safety valve for future content changes:

```css
.hero-right {
  position: absolute;
  top: 80px;
  right: 80px;
  bottom: 60px;
  width: 300px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;   /* ADD THIS */
}
```

---

## Site-Wide Overflow Audit

After fixing the hero, scan the entire codebase for similar overflow problems. Search for these patterns:

### 1. Absolute-positioned elements inside fixed/min-height containers
Search `app/page.tsx` and all files in `app/dashboard/` and `components/` for:
- Any `position: absolute` or `position: fixed` element inside a container that has an explicit `height` or `min-height`
- Containers that use `overflow: hidden` without also ensuring their absolute children fit

### 2. Flex children that may overflow
Look for:
- Any `flex` container where children don't have `flex-shrink` set and could overflow on smaller viewports
- Stat cards grid on the homepage — verify they don't overflow on screens between 900–1100px wide

### 3. The hero-left `overflow: hidden`
In globals.css, `.hero-left` has `overflow: hidden`. This clips any content that exceeds the left column bounds. Verify that on viewport heights < 700px, the onboarding pills + search bar aren't being clipped. If they are, change to `overflow: visible` and handle any visual bleed differently.

### 4. Dashboard pages — stat cards
In `app/dashboard/page.tsx`, check that the 4-column stats grid degrades properly at 900–1200px widths. They should wrap to 2×2 before wrapping to single column.

### 5. Results page tab bar
In `app/page.tsx`, the tab bar (PATTERNS | NARRATIVE | REPORT | TRANSACTIONS | SIMULATOR | FLOW) — verify it doesn't overflow horizontally on screens narrower than 1100px. If it does, add horizontal scrolling to the tab container:
```css
overflow-x: auto;
-webkit-overflow-scrolling: touch;
white-space: nowrap;
```

---

## Verification Steps

1. Run `npm run dev`
2. Resize browser to 1024px wide — hero right panel should be fully visible and contained
3. Resize to 1440px — same check
4. Resize to 900px — right panel should disappear (media query hides it)
5. On dashboard at 1024px — stat cards should be 2×2 or 4×1, not overflowing
6. On results page at 1100px — tab bar should not overflow its container
