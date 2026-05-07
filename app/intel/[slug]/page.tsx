import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getArticle, INTEL_ARTICLES } from '@/lib/intel-articles';

export async function generateStaticParams() {
  return INTEL_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};
  return {
    title: `${article.title} — ClearChain Intel`,
    description: article.summary,
  };
}

export default async function IntelArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Tag badge colors
  const tagBg: Record<string, string> = {
    '#22d3ee': 'rgba(34,211,238,0.1)',
    '#00ff88': 'rgba(0,255,136,0.1)',
    '#ff3b3b': 'rgba(255,59,59,0.1)',
    '#ff8c00': 'rgba(255,140,0,0.1)',
    '#ffd60a': 'rgba(255,214,10,0.1)',
  };
  const bg = tagBg[article.tagColor] ?? 'rgba(255,255,255,0.06)';

  return (
    <div style={{ minHeight: '100vh', background: '#00080f', color: '#ecfeff', fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}>

      {/* Nav */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid rgba(6,182,212,0.08)', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, background: 'rgba(0,8,15,0.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="/" style={{ fontSize: 15, letterSpacing: '0.15em', color: '#22d3ee', fontFamily: 'var(--font-rubik-glitch)', fontWeight: 400, textDecoration: 'none' }}>CLEARCHAIN</a>
          <a href="/intel" style={{ fontSize: 12, color: '#7ec8d8', textDecoration: 'none', letterSpacing: '0.08em' }}>← Intel</a>
        </div>
        {user ? (
          <a href="/dashboard" style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: '#06b6d4', textDecoration: 'none' }}>DASHBOARD →</a>
        ) : (
          <a href="/auth/login" style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.1em', color: '#7ec8d8', textDecoration: 'none' }}>SIGN IN →</a>
        )}
      </nav>

      {/* Article */}
      <div style={{ maxWidth: 740, margin: '0 auto', padding: '56px 32px 120px' }}>

        {/* Tag + meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <span style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            padding: '3px 10px',
            borderRadius: 3,
            background: bg,
            color: article.tagColor,
            border: `1px solid ${article.tagColor}22`,
          }}>{article.tag}</span>
          <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, color: '#1e4d5c', letterSpacing: '0.08em' }}>
            {article.publishedAt} · {article.readTime} read
          </span>
        </div>

        {/* Title */}
        <h1 style={{
          fontFamily: 'var(--font-space-grotesk), system-ui',
          fontSize: 34,
          fontWeight: 700,
          color: '#ecfeff',
          margin: '0 0 14px',
          lineHeight: 1.2,
          letterSpacing: '-0.02em',
        }}>{article.title}</h1>

        {/* Subtitle */}
        <p style={{
          fontFamily: 'var(--font-inter), system-ui',
          fontSize: 16,
          color: '#7ec8d8',
          lineHeight: 1.65,
          margin: '0 0 40px',
        }}>{article.subtitle}</p>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(6,182,212,0.08)', marginBottom: 40 }} />

        {/* Body — rendered from article data */}
        <div style={{ fontFamily: 'var(--font-inter), system-ui' }}>
          {article.body}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(6,182,212,0.08)', margin: '56px 0 40px' }} />

        {/* CTA */}
        <div style={{
          background: '#001824',
          border: '1px solid rgba(34,211,238,0.12)',
          borderRadius: 8,
          padding: '28px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 16, fontWeight: 600, color: '#ecfeff', marginBottom: 6 }}>Check a wallet now</div>
            <div style={{ fontFamily: 'var(--font-inter)', fontSize: 13, color: '#7ec8d8', lineHeight: 1.5 }}>
              Free OFAC screening, risk scoring, and on-chain analysis in seconds.
            </div>
          </div>
          <a href="/" style={{
            display: 'inline-block',
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 11,
            letterSpacing: '0.1em',
            color: '#00080f',
            background: '#22d3ee',
            padding: '10px 20px',
            borderRadius: 4,
            textDecoration: 'none',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>RUN ANALYSIS →</a>
        </div>

        {/* More articles */}
        <div style={{ marginTop: 56 }}>
          <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.18em', color: '#1e4d5c', marginBottom: 20, textTransform: 'uppercase' }}>More from Intel</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {INTEL_ARTICLES.filter(a => a.slug !== article.slug).map(a => (
              <a key={a.slug} href={`/intel/${a.slug}`} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                textDecoration: 'none',
                gap: 16,
              }}>
                <div>
                  <span style={{ display: 'inline-block', fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9, letterSpacing: '0.1em', padding: '2px 7px', borderRadius: 2, background: tagBg[a.tagColor] ?? 'rgba(255,255,255,0.06)', color: a.tagColor, marginBottom: 6, textTransform: 'uppercase' }}>{a.tag}</span>
                  <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 14, color: '#ecfeff', fontWeight: 500 }}>{a.title}</div>
                </div>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: '#1e4d5c', flexShrink: 0 }}>→</span>
              </a>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
