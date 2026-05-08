# Task 23 — Ad Slots + Pro Gate + Pricing Page Update

## Context

ClearChain is a wallet safety checker for regular crypto users — not a compliance platform. The free tier should be ad-supported. Pro is $7/mo and removes ads. This task:

1. Adds `is_pro` to Supabase user metadata
2. Creates a reusable `AdSlot` component (shows for free users, hidden for pro)
3. Places one ad slot in the results section of `app/page.tsx`
4. Updates `app/pricing/page.tsx` — $7/mo, consumer language, ad-supported free tier

---

## Design System

```
Background:   #03040a (page) / #080b14 (cards)
Accent cyan:  #06b6d4
Borders:      rgba(255,255,255,0.06)
Text:         #f0f4ff primary, #8892a4 secondary, #3d4a5c dim
Fonts:        Space Grotesk (headings), JetBrains Mono (labels), system-ui (body)
Rules:        No border-radius > 4px. No icon libraries. Inline SVG only.
```

---

## Step 1: Supabase — `is_pro` flag

No new table needed. Store `is_pro` in Supabase Auth user metadata. To set it manually for testing:

```sql
update auth.users
set raw_user_meta_data = raw_user_meta_data || '{"is_pro": true}'
where email = 'your@email.com';
```

To read it in server components:
```typescript
const { data: { user } } = await supabase.auth.getUser();
const isPro = user?.user_metadata?.is_pro === true;
```

To read it in client components (after session fetch):
```typescript
const isPro = session?.user?.user_metadata?.is_pro === true;
```

For now, unauthenticated users and users without `is_pro: true` are treated as free tier.

---

## Step 2: `components/AdSlot.tsx`

Create this new component. It renders a placeholder ad unit for free users and nothing for pro users. In production, the placeholder div would be replaced by a real ad network script (Google AdSense, Carbon Ads, etc.) — but for now render a styled placeholder so the slot is visible and the layout is established.

```tsx
'use client';

interface AdSlotProps {
  isPro: boolean;
  slot?: 'results-banner' | 'sidebar';
}

export default function AdSlot({ isPro, slot = 'results-banner' }: AdSlotProps) {
  if (isPro) return null;

  const isBanner = slot === 'results-banner';

  return (
    <div
      style={{
        width: '100%',
        height: isBanner ? 90 : 250,
        background: 'rgba(255,255,255,0.015)',
        border: '1px solid rgba(255,255,255,0.04)',
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 4,
        margin: '16px 0',
        position: 'relative',
      }}
    >
      {/* AD label — top left */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 8,
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 7,
          letterSpacing: '0.15em',
          color: '#3d4a5c',
        }}
      >
        AD
      </div>

      {/* Placeholder content */}
      <div
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 9,
          letterSpacing: '0.12em',
          color: '#1e4d5c',
          textAlign: 'center',
        }}
      >
        ADVERTISEMENT
      </div>
      <a
        href="/pricing"
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 8,
          letterSpacing: '0.1em',
          color: 'rgba(6,182,212,0.4)',
          textDecoration: 'none',
        }}
      >
        Go Pro to remove ads →
      </a>
    </div>
  );
}
```

---

## Step 3: Wire `AdSlot` into `app/page.tsx`

`app/page.tsx` is a client component, so reading `is_pro` from the server isn't straightforward inline. Use a simple approach: fetch the Supabase session on mount and derive `isPro` from user metadata.

In the main `Home` component (or wherever `useEffect` + supabase client is already used to check auth), add:

```tsx
const [isPro, setIsPro] = useState(false);

useEffect(() => {
  const supabase = createClient();
  supabase.auth.getSession().then(({ data: { session } }) => {
    setIsPro(session?.user?.user_metadata?.is_pro === true);
  });
}, []);
```

Then place ONE `AdSlot` in the results section — render it between the `ExposureBreakdown` component and the tabs/content below it. Only render when results are showing:

```tsx
{analysis && (
  <AdSlot isPro={isPro} slot="results-banner" />
)}
```

Import: `import AdSlot from '@/components/AdSlot';`

---

## Step 4: Update `app/pricing/page.tsx`

Make the following targeted changes — do not rewrite the whole file, surgical edits only:

### 4a. Page metadata
```typescript
export const metadata = {
  title: 'Pricing — ClearChain',
  description: 'Free wallet safety checks for everyone. Go Pro for $7/mo to remove ads and unlock unlimited scans.',
};
```

### 4b. Header section
Change the h1 and subtitle:
```tsx
<h1>
  Free to use.<br />$7/mo to go Pro.
</h1>
<p>
  Check any wallet before you send or receive crypto. Free forever — upgrade to Pro to remove ads and unlock unlimited scans.
</p>
```

### 4c. Pro card — price
Change `$12` → `$7`

### 4d. Pro card — description
Change from:
> "For investigators, compliance analysts, and anyone who screens wallets regularly."

To:
> "For anyone who uses crypto regularly and wants unlimited checks, no ads, and the full feature set."

### 4e. Free tier feature rows — add "Ad-supported"
In the free tier feature list, add this row after the existing ones (before the CTA button):
```tsx
{row(DASH, 'Ad-supported', 'Small ads shown in results')}
```

### 4f. Pro tier feature rows — add "No ads"
In the pro tier feature list, add:
```tsx
{row(CHECK, 'No ads', 'Clean experience, no interruptions')}
```

### 4g. Comparison table — add "Ads" row
Add to the features array:
```typescript
{ feature: 'Ad-free experience', free: '—', pro: '✓' },
```
Place it near the top of the table, after "Wallet scans".

### 4h. Pro CTA button
Update the `href` signup URL param:
```tsx
href={user ? '/dashboard/settings' : '/auth/signup?plan=pro'}
```
This is already correct — leave it.

---

## What NOT to do

- Do not integrate a real ad network — placeholder only
- Do not add more than one ad slot in `page.tsx` — one banner in results only
- Do not add ads to the dashboard, docs, intel, or pricing pages
- Do not gate the core analysis behind `isPro` — analysis is always free
- Do not rewrite `pricing/page.tsx` from scratch — surgical edits only
- Do not use `border-radius > 4px`

---

## Dev Command

```bash
npm run dev
```
