# Task 17 — Custom Risk Profiles

## Context

ClearChain is a crypto AML intelligence platform built on Next.js 16 (App Router, Turbopack), TypeScript strict, Tailwind CSS, and Supabase. The live URL is https://clearchain.vercel.app.

The scoring engine (`lib/scoring.ts`) currently uses hardcoded signal weights:
- OFAC/SDN match: 40 pts
- Mixer/tumbler interaction: 25 pts
- Rapid fund movement: 15 pts
- High-risk counterparty: 10 pts
- Indirect exposure: 8 pts
- Volume anomaly: 5 pts
- Community red flags: 5 pts

Risk level thresholds (also hardcoded in `lib/scoring.ts`):
- LOW: 0–24
- MEDIUM: 25–49
- HIGH: 50–74
- CRITICAL: 75–100

This task adds a **Custom Risk Profiles** feature: authenticated users can create named profiles with their own signal weights and risk thresholds. One profile is marked active and used automatically whenever that user runs an analysis.

---

## Design System (must be followed exactly)

```
Background:   #03040a (page) / #080b14 (cards) / #0d1220 (elevated)
Accent:       #06b6d4 (cyan) primary — NOT green
Active/focus: rgba(6,182,212,0.1) bg, rgba(6,182,212,0.2) border
Critical:     #ff3b3b | High: #ff8c00 | Medium: #ffd60a | Low: #22d3ee
Borders:      rgba(255,255,255,0.06) default
Text:         #f0f4ff primary, #8892a4 secondary, #3d4a5c dim
Fonts:        Space Grotesk (headings), JetBrains Mono (addresses/data), system-ui (body)
Rules:        No border-radius > 4px. No text gradients. Inline SVG only. No icon libraries.
```

---

## Supabase Changes

### 1. New table: `risk_profiles`

Run this in the Supabase SQL editor:

```sql
create table public.risk_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  name          text not null,
  is_active     boolean not null default false,
  signal_weights jsonb not null default '{
    "ofac_match": 40,
    "mixer_interaction": 25,
    "rapid_fund_movement": 15,
    "high_risk_counterparty": 10,
    "indirect_exposure": 8,
    "volume_anomaly": 5,
    "community_red_flags": 5
  }',
  risk_thresholds jsonb not null default '{
    "medium": 25,
    "high": 50,
    "critical": 75
  }',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- RLS
alter table public.risk_profiles enable row level security;

create policy "Users manage own profiles"
  on public.risk_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Only one active profile per user at a time
create unique index risk_profiles_one_active
  on public.risk_profiles (user_id)
  where (is_active = true);

-- Index for listing by user
create index risk_profiles_user_id_idx on public.risk_profiles (user_id);
```

### 2. Add `profile_id` to `analyses` table

```sql
alter table public.analyses
  add column if not exists profile_id uuid references public.risk_profiles(id) on delete set null;
```

---

## Types (add to `types/index.ts`)

```typescript
export interface SignalWeights {
  ofac_match: number;
  mixer_interaction: number;
  rapid_fund_movement: number;
  high_risk_counterparty: number;
  indirect_exposure: number;
  volume_anomaly: number;
  community_red_flags: number;
}

export interface RiskThresholds {
  medium: number;   // score >= medium → MEDIUM
  high: number;     // score >= high → HIGH
  critical: number; // score >= critical → CRITICAL
}

export interface RiskProfile {
  id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  signal_weights: SignalWeights;
  risk_thresholds: RiskThresholds;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_SIGNAL_WEIGHTS: SignalWeights = {
  ofac_match: 40,
  mixer_interaction: 25,
  rapid_fund_movement: 15,
  high_risk_counterparty: 10,
  indirect_exposure: 8,
  volume_anomaly: 5,
  community_red_flags: 5,
};

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  medium: 25,
  high: 50,
  critical: 75,
};
```

---

## Scoring Engine Changes (`lib/scoring.ts`)

### Score normalization

When a user sets custom weights, the total possible score may no longer be 100. Normalize the final score so it always sits on the 0–100 scale:

```
normalizedScore = Math.round((rawTotal / maxPossibleScore) * 100)
```

Where `maxPossibleScore` is the sum of all weights in the active profile.

### Update `getRiskLevel`

Accept optional custom thresholds:

```typescript
export function getRiskLevel(score: number, thresholds?: RiskThresholds): RiskLevel {
  const t = thresholds ?? DEFAULT_RISK_THRESHOLDS;
  if (score >= t.critical) return 'CRITICAL';
  if (score >= t.high)     return 'HIGH';
  if (score >= t.medium)   return 'MEDIUM';
  return 'LOW';
}
```

### Update `computeRiskScore`

Add `customWeights` and `customThresholds` optional params. Each signal evaluator still determines **whether** it triggered (binary logic unchanged). The weight applied at scoring time comes from `customWeights` if provided:

```typescript
export function computeRiskScore(params: {
  transactions: WalletTransaction[];
  ofacResult: OFACResult;
  communityFlags: number;
  address: string;
  indirectExposureHits?: Array<{ address: string; entity: string; type: 'ofac' | 'mixer' }>;
  customWeights?: SignalWeights;
  customThresholds?: RiskThresholds;
}): RiskScore {
  const weights = params.customWeights ?? DEFAULT_SIGNAL_WEIGHTS;
  const thresholds = params.customThresholds ?? DEFAULT_RISK_THRESHOLDS;

  // evaluate signals as before — but override each signal's weight and score
  // using weights[signal.name] rather than the hardcoded constant.
  // signal.triggered is still determined by the existing logic.
  // signal.score = triggered ? weights[signal.name] : 0

  const maxPossible = Object.values(weights).reduce((a, b) => a + b, 0);
  const rawTotal = signalList.reduce((sum, s) => sum + s.score, 0);
  const total = maxPossible > 0 ? Math.min(100, Math.round((rawTotal / maxPossible) * 100)) : 0;

  return {
    total,
    level: getRiskLevel(total, thresholds),
    signals,
  };
}
```

**Important:** The `detail` strings on each signal should mention the custom weight when it differs from the default. E.g.: `"(weighted ${weight} pts in your active profile)"` appended to the detail.

---

## API Routes

### `app/api/profiles/route.ts`

**GET** — list all profiles for the authenticated user, ordered by `created_at desc`.

**POST** — create a new profile. Body:
```typescript
{ name: string; signal_weights: SignalWeights; risk_thresholds: RiskThresholds }
```
Validates that all 7 signal weight keys are present and each value is 0–100. Validates thresholds are ascending (medium < high < critical) and each is 0–100. Returns the created profile.

Always use the cookie-forwarding Supabase pattern:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
const cookieStore = await cookies()
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { cookies: { getAll: () => cookieStore.getAll(), setAll: (s) => { try { s.forEach(({name,value,options}) => cookieStore.set(name,value,options)) } catch{} } } }
)
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

### `app/api/profiles/[id]/route.ts`

**PUT** — update name, weights, and/or thresholds. Same validation as POST. Returns updated profile.

**DELETE** — delete a profile. Guard: cannot delete an active profile (return 400 with message "Deactivate this profile before deleting it"). Cannot delete if it's the user's only profile.

### `app/api/profiles/[id]/activate/route.ts`

**POST** — set a profile as active for the user. Must deactivate any currently active profile atomically:

```typescript
// Deactivate current active
await supabase
  .from('risk_profiles')
  .update({ is_active: false })
  .eq('user_id', user.id)
  .eq('is_active', true);

// Activate new one
await supabase
  .from('risk_profiles')
  .update({ is_active: true, updated_at: new Date().toISOString() })
  .eq('id', id)
  .eq('user_id', user.id);
```

---

## Analyze Route Changes (`app/api/analyze/route.ts`)

After authenticating the user (or even for unauthenticated users — use defaults), fetch the active profile:

```typescript
let customWeights: SignalWeights | undefined;
let customThresholds: RiskThresholds | undefined;
let activeProfileId: string | undefined;

if (user) {
  const { data: profile } = await supabase
    .from('risk_profiles')
    .select('id, signal_weights, risk_thresholds')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (profile) {
    customWeights = profile.signal_weights as SignalWeights;
    customThresholds = profile.risk_thresholds as RiskThresholds;
    activeProfileId = profile.id;
  }
}
```

Pass these into `computeRiskScore`. When saving the analysis to Supabase, include `profile_id: activeProfileId ?? null`.

---

## Settings UI (`app/dashboard/settings/page.tsx`)

Create a new page at this path. Add a "Settings" link to the dashboard sidebar/nav.

### Layout

```
RISK PROFILES
─────────────────────────────────────────────────
[+ NEW PROFILE]                    [profile cards]

Active profile card shown with cyan left border.
Other profiles shown with default border.
```

### Profile Card

Each profile shows:
- Name (editable inline on click)
- "ACTIVE" badge if is_active (cyan, JetBrains Mono, uppercase)
- Signal weights as a compact table (signal name | weight | bar visualization)
- Risk thresholds: LOW <25 / MEDIUM 25–49 / HIGH 50–74 / CRITICAL 75+
- Buttons: [SET ACTIVE] [EDIT] [DELETE]

### Profile Editor (inline expand or modal — your call)

Fields:
- **Name** — text input
- **Signal Weights** — one row per signal with:
  - Signal label
  - Number input (0–100, integer)
  - Thin bar showing proportion of total
  - Total weight shown at bottom (e.g. "TOTAL WEIGHT: 108 pts → normalizes to 100")
- **Risk Thresholds** — three number inputs: MEDIUM cutoff, HIGH cutoff, CRITICAL cutoff. Show validation error if not ascending.
- **Live Preview** — a small mock score card showing "How a wallet scoring 65 raw pts would appear under this profile" — updates as user adjusts weights/thresholds
- [SAVE] [CANCEL] buttons

### Empty state

If user has no profiles:
```
NO CUSTOM PROFILES

ClearChain's standard methodology is active by default.
Create a profile to customize signal weights and risk thresholds
for your institution's compliance requirements.

[CREATE YOUR FIRST PROFILE]
```

---

## Dashboard Nav

Add "SETTINGS" to the dashboard sidebar navigation (below "CASES"). Route: `/dashboard/settings`.

---

## Validation Rules

- All 7 signal keys must be present in `signal_weights`
- Each weight: integer, 0–100
- Thresholds must be strictly ascending: `medium < high < critical`
- Each threshold: integer, 1–99
- Profile name: 1–60 characters, required
- Max profiles per user: 10 (return 400 if exceeded)

---

## What NOT to do

- Do not let users define custom signal logic — only weights and thresholds
- Do not auto-create a default profile row in Supabase for new users — just fall back to hardcoded defaults in code when no active profile exists
- Do not use any icon libraries — inline SVG only
- Do not use border-radius > 4px anywhere
- Do not use `createClient()` from `lib/supabase/server.ts` in API routes — always use the cookie-forwarding pattern shown above

---

## Dev Command

```bash
npm run dev
```

This must be used exactly (custom script that injects non-NEXT_PUBLIC env vars for Turbopack).
