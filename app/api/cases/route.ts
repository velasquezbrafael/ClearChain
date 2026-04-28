import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// GET — list user's open/active cases for the save-to-case dropdown
export async function GET() {
  const supabase = await getSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })

  const { data, error } = await supabase
    .from('cases')
    .select('id, title, status')
    .eq('user_id', user.id)
    .neq('status', 'closed')
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })
  return NextResponse.json({ cases: data }, { headers: CORS })
}

// POST — create a new case, optionally linking an address + analysis
export async function POST(request: NextRequest) {
  const supabase = await getSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })

  let body: { title?: string; description?: string; address?: string; analysisId?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS })
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400, headers: CORS })
  }

  const { data: newCase, error: caseError } = await supabase.from('cases').insert({
    user_id: user.id,
    title: body.title.trim(),
    description: body.description?.trim() || null,
    status: 'open',
  }).select().single()

  if (caseError || !newCase) {
    return NextResponse.json({ error: caseError?.message }, { status: 500, headers: CORS })
  }

  if (body.address) {
    await supabase.from('case_addresses').insert({
      case_id: newCase.id,
      address: body.address,
      chain: 'ETH',
      analysis_id: body.analysisId ?? null,
    })
  }

  return NextResponse.json({ case: newCase }, { status: 201, headers: CORS })
}
