import { createClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'Pricing — ClearChain',
  description: 'Free wallet safety checks for everyone. Go Pro for $7/mo to remove ads and unlock unlimited scans.',
};

const CHECK = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
    <circle cx="7" cy="7" r="7" fill="rgba(0,255,136,0.12)" />
    <path d="M4 7l2 2 4-4" stroke="#00ff88" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DASH = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
    <circle cx="7" cy="7" r="7" fill="rgba(255,255,255,0.04)" />
    <path d="M4.5 7h5" stroke="#3d4a5c" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export default async function PricingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const row = (icon: React.ReactNode, label: string, sub?: string) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {icon}
      <div>
        <div style={{ fontSize: 13, color: '#ecfeff', lineHeight: 1.4 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: '#3d4a5c', marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#00080f', color: '#ecfeff', fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}>

      {/* Nav */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid rgba(6,182,212,0.08)', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, background: 'rgba(0,8,15,0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="/" style={{ fontSize: 15, letterSpacing: '0.15em', color: '#22d3ee', fontFamily: 'var(--font-rubik-glitch)', fontWeight: 400, textDecoration: 'none' }}>CLEARCHAIN</a>
          <a href="/" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>← Back to Tool</a>
          <a href="/docs" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>Docs</a>
          <a href="/intel" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>Intel</a>
        </div>
        {user ? (
          <a href="/dashboard" style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: '#06b6d4', textDecoration: 'none' }}>DASHBOARD →</a>
        ) : (
          <a href="/auth/login" style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: '#7ec8d8', textDecoration: 'none' }}>SIGN IN →</a>
        )}
      </nav>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '64px 32px 120px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.2em', color: '#1e4d5c', marginBottom: 12, textTransform: 'uppercase' }}>Pricing</div>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 40, fontWeight: 700, color: '#ecfeff', margin: '0 0 16px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Free to use.<br />$7/mo to go Pro.
          </h1>
          <p style={{ fontFamily: 'var(--font-inter), system-ui', fontSize: 15, color: '#7ec8d8', margin: 0, lineHeight: 1.6, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
            Check any wallet before you send or receive crypto. Free forever — upgrade to Pro to remove ads and unlock unlimited scans.
          </p>
        </div>

        {/* Tier cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 64 }}>

          {/* Free */}
          <div style={{ background: '#001824', border: '1px solid rgba(6,182,212,0.1)', borderRadius: 12, padding: '32px 28px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#1e4d5c', textTransform: 'uppercase', marginBottom: 10 }}>Free</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 44, fontWeight: 700, color: '#ecfeff', letterSpacing: '-0.03em' }}>$0</span>
                <span style={{ fontSize: 13, color: '#3d4a5c' }}>forever</span>
              </div>
              <p style={{ fontFamily: 'var(--font-inter), system-ui', fontSize: 13, color: '#7ec8d8', margin: 0, lineHeight: 1.6 }}>
                Check wallets before you transact. No account required for your first 5 scans.
              </p>
            </div>

            <div style={{ flex: 1, marginBottom: 28 }}>
              {row(CHECK, '5 wallet scans', 'Per device, no sign-up needed')}
              {row(CHECK, 'OFAC / SDN screening')}
              {row(CHECK, 'Risk score + signal breakdown')}
              {row(CHECK, 'Risk score rationale')}
              {row(CHECK, 'Typology detection')}
              {row(CHECK, 'Browser extension', 'Inline badge on any wallet address')}
              {row(DASH, 'Unlimited scans')}
              {row(DASH, 'API access')}
              {row(DASH, 'Case management')}
              {row(DASH, 'SAR draft export')}
              {row(DASH, 'Watchlist alerts')}
              {row(DASH, 'Ad-supported', 'Small ads shown in results')}
            </div>

            <a
              href="/auth/signup"
              style={{ display: 'block', textAlign: 'center', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.1em', color: '#7ec8d8', border: '1px solid rgba(34,211,238,0.2)', borderRadius: 6, padding: '12px 0', textDecoration: 'none' }}
            >
              GET STARTED FREE
            </a>
          </div>

          {/* Pro */}
          <div style={{ background: '#001824', border: '1px solid rgba(0,255,136,0.25)', borderRadius: 12, padding: '32px 28px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

            {/* Recommended badge */}
            <div style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: '0 12px 0 8px', padding: '4px 12px', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.12em', color: '#00ff88' }}>
              MOST POPULAR
            </div>

            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.15em', color: '#00ff88', textTransform: 'uppercase', marginBottom: 10 }}>Pro</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 44, fontWeight: 700, color: '#ecfeff', letterSpacing: '-0.03em' }}>$7</span>
                <span style={{ fontSize: 13, color: '#3d4a5c' }}>/month</span>
              </div>
              <p style={{ fontFamily: 'var(--font-inter), system-ui', fontSize: 13, color: '#7ec8d8', margin: 0, lineHeight: 1.6 }}>
                For anyone who uses crypto regularly and wants unlimited checks, no ads, and the full feature set.
              </p>
            </div>

            <div style={{ flex: 1, marginBottom: 28 }}>
              {row(CHECK, 'Unlimited wallet scans')}
              {row(CHECK, 'OFAC / SDN screening')}
              {row(CHECK, 'Risk score + signal breakdown')}
              {row(CHECK, 'Risk score rationale')}
              {row(CHECK, 'Typology detection')}
              {row(CHECK, 'Browser extension')}
              {row(CHECK, 'API access', '500 requests/day')}
              {row(CHECK, 'Case management', 'Unlimited cases, notes, status tracking')}
              {row(CHECK, 'SAR draft export', 'AI-generated, PDF download')}
              {row(CHECK, 'Watchlist alerts', 'Email on risk change or new OFAC match')}
              {row(CHECK, 'No ads', 'Clean experience, no interruptions')}
            </div>

            <a
              href={user ? '/dashboard/settings' : '/auth/signup?plan=pro'}
              style={{ display: 'block', textAlign: 'center', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.1em', color: '#00080f', background: '#22d3ee', borderRadius: 6, padding: '12px 0', textDecoration: 'none', fontWeight: 700 }}
            >
              START PRO →
            </a>
          </div>

        </div>

        {/* Feature comparison table */}
        <div style={{ marginBottom: 64 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.18em', color: '#1e4d5c', marginBottom: 20, textTransform: 'uppercase' }}>Full comparison</div>
          <div style={{ background: '#001824', border: '1px solid rgba(6,182,212,0.08)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(6,182,212,0.08)' }}>
                  <th style={{ padding: '12px 20px', textAlign: 'left', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: '#1e4d5c', fontWeight: 400 }}>Feature</th>
                  <th style={{ padding: '12px 20px', textAlign: 'center', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: '#1e4d5c', fontWeight: 400, width: 100 }}>Free</th>
                  <th style={{ padding: '12px 20px', textAlign: 'center', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: '#00ff88', fontWeight: 400, width: 100 }}>Pro</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Wallet scans', free: '5 / device', pro: 'Unlimited' },
                  { feature: 'Ad-free experience', free: '—', pro: '✓' },
                  { feature: 'OFAC / SDN screening', free: '✓', pro: '✓' },
                  { feature: 'Risk score & signals', free: '✓', pro: '✓' },
                  { feature: 'Risk score rationale', free: '✓', pro: '✓' },
                  { feature: 'Indirect exposure detection', free: '✓', pro: '✓' },
                  { feature: 'Typology detection (7 patterns)', free: '✓', pro: '✓' },
                  { feature: 'Stablecoin tracking (USDC, USDT, DAI)', free: '✓', pro: '✓' },
                  { feature: 'Investigation Mode', free: '✓', pro: '✓' },
                  { feature: 'Browser extension', free: '✓', pro: '✓' },
                  { feature: 'API access', free: '—', pro: '500 req/day' },
                  { feature: 'Case management', free: '—', pro: '✓' },
                  { feature: 'SAR draft export (PDF)', free: '—', pro: '✓' },
                  { feature: 'Watchlist alerts', free: '—', pro: '✓' },
                  { feature: 'Bulk address screening', free: '—', pro: '✓' },
                ].map((r, i) => (
                  <tr key={r.feature} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{ padding: '10px 20px', color: '#8892a4', fontFamily: 'var(--font-inter), system-ui' }}>{r.feature}</td>
                    <td style={{ padding: '10px 20px', textAlign: 'center', color: r.free === '—' ? '#3d4a5c' : '#7ec8d8', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12 }}>{r.free}</td>
                    <td style={{ padding: '10px 20px', textAlign: 'center', color: r.pro === '—' ? '#3d4a5c' : '#00ff88', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 12 }}>{r.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div style={{ marginBottom: 64 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.18em', color: '#1e4d5c', marginBottom: 20, textTransform: 'uppercase' }}>Common questions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[
              {
                q: 'What counts as a wallet scan?',
                a: 'Each time you submit a wallet address for analysis, that\'s one scan. Re-running the same address counts again. Free users get 5 scans per device before being asked to sign up.',
              },
              {
                q: 'Do I need an account to use ClearChain?',
                a: 'No. You can run up to 5 scans without creating an account. After that, a free account gives you access to your scan history. The Pro plan unlocks unlimited scans and all compliance features.',
              },
              {
                q: 'What chains are supported?',
                a: 'Ethereum (ETH), Bitcoin (BTC), Tron (TRX), and Solana (SOL). Stablecoin transfers (USDC, USDT, DAI) are tracked on Ethereum. More chains coming.',
              },
              {
                q: 'Is my data private?',
                a: 'Addresses you analyze are stored to power the live Intel feed aggregate stats — no personal data, no user IDs. Your cases, notes, and SAR drafts are private to your account and protected by row-level security.',
              },
              {
                q: 'Can I cancel anytime?',
                a: 'Yes. Cancel from your dashboard settings at any time. You keep Pro access until the end of your billing period.',
              },
              {
                q: 'Do you offer team or enterprise plans?',
                a: 'Not yet — but if you need multi-seat access, higher API limits, or a custom integration, reach out at clearchain@proton.me and we\'ll work something out.',
              },
            ].map(({ q, a }) => (
              <div key={q} style={{ padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 14, fontWeight: 500, color: '#ecfeff', marginBottom: 8 }}>{q}</div>
                <div style={{ fontFamily: 'var(--font-inter), system-ui', fontSize: 13, color: '#7ec8d8', lineHeight: 1.65 }}>{a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div style={{ textAlign: 'center', background: '#001824', border: '1px solid rgba(34,211,238,0.1)', borderRadius: 12, padding: '48px 32px' }}>
          <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 22, fontWeight: 600, color: '#ecfeff', marginBottom: 10 }}>Start with a free scan</div>
          <p style={{ fontFamily: 'var(--font-inter), system-ui', fontSize: 14, color: '#7ec8d8', margin: '0 0 24px', lineHeight: 1.6 }}>
            No account required. Paste any ETH, BTC, TRX, or SOL address and get a full risk report in seconds.
          </p>
          <a href="/" style={{ display: 'inline-block', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, letterSpacing: '0.1em', color: '#00080f', background: '#22d3ee', borderRadius: 6, padding: '12px 28px', textDecoration: 'none', fontWeight: 700 }}>
            CHECK A WALLET →
          </a>
        </div>

      </div>
    </div>
  );
}
