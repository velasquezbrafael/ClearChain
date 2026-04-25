/**
 * GET /api/cases/[id]/report
 *
 * Generates and streams a branded PDF case report using @react-pdf/renderer.
 * Auth-gated — returns 401 if not logged in, 404 if case not found or doesn't
 * belong to the authenticated user.
 *
 * Uses dynamic imports for @react-pdf/renderer so it is never touched by the
 * bundler at build time (only loaded at runtime on Node.js).
 */

import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

// Force Node.js runtime — @react-pdf/renderer requires fs, canvas, etc.
export const runtime = 'nodejs'

// Type-only imports are erased at build time — safe to keep static
import type { AddressForReport, NoteForReport } from '@/components/CaseReportPDF'

// ---------------------------------------------------------------------------
// Types — mirror the Supabase row shapes we select
// ---------------------------------------------------------------------------

interface AnalysisJoin {
  risk_score: number | null
  risk_level: string | null
  signals: unknown
  typologies: unknown
  sar_draft: string | null
  narrative: string | null
}

interface CaseAddressRow {
  address: string
  chain: string
  analyses: AnalysisJoin | AnalysisJoin[] | null
}

interface CaseNoteRow {
  content: string
  created_at: string
  author_name: string | null
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Build cookie-forwarding Supabase client
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) {
          try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
          catch {}
        },
      },
    }
  )

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch case — ensure it belongs to this user
  const { data: caseRow } = await supabase
    .from('cases')
    .select('id, title, description, status, created_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!caseRow) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  // Fetch addresses joined with analyses
  const { data: rawAddrs } = await supabase
    .from('case_addresses')
    .select(`
      address,
      chain,
      analyses (
        risk_score,
        risk_level,
        signals,
        typologies,
        sar_draft,
        narrative
      )
    `)
    .eq('case_id', id)
    .order('created_at', { ascending: false })

  // Fetch notes chronologically
  const { data: rawNotes } = await supabase
    .from('case_notes')
    .select('content, created_at, author_name')
    .eq('case_id', id)
    .order('created_at', { ascending: true })

  // Normalize addresses — Supabase may return analyses as object or array
  const addrRows = (rawAddrs as unknown as CaseAddressRow[]) ?? []
  const addresses: AddressForReport[] = addrRows.map(row => {
    const a: AnalysisJoin | null = Array.isArray(row.analyses)
      ? (row.analyses[0] ?? null)
      : (row.analyses ?? null)
    return {
      address: row.address,
      chain: row.chain,
      risk_score: a?.risk_score ?? 0,
      risk_level: a?.risk_level ?? 'LOW',
      signals: Array.isArray(a?.signals) ? (a.signals as AddressForReport['signals']) : [],
      typologies: Array.isArray(a?.typologies) ? (a.typologies as AddressForReport['typologies']) : [],
      sar_draft: a?.sar_draft ?? null,
      narrative: a?.narrative ?? null,
    }
  })

  // Normalize notes
  const notes: NoteForReport[] = ((rawNotes as unknown as CaseNoteRow[]) ?? []).map(n => ({
    content: n.content,
    created_at: n.created_at,
    author_name: n.author_name,
  }))

  // Dynamically import @react-pdf/renderer and CaseReportPDF so the bundler
  // never processes these packages at build time.
  try {
    const [{ renderToBuffer }, { CaseReportPDF }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('@/components/CaseReportPDF'),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(CaseReportPDF as any, {
      caseData: caseRow,
      addresses,
      notes,
    })

    // renderToBuffer returns a Node Buffer — convert to Uint8Array for Response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeBuffer = await renderToBuffer(element as any)
    const buffer = new Uint8Array(nodeBuffer)

    const safeTitle = (caseRow.title as string)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="clearchain-case-${safeTitle || id.slice(0, 8)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[ClearChain/report] PDF render failed:', err)
    return NextResponse.json(
      { error: 'Failed to generate PDF report' },
      { status: 500 }
    )
  }
}
