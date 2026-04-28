/**
 * ClearChain — PATCH /api/cases/[id]
 *
 * Updates case status. Fires an email via Resend when status changes to
 * 'escalated' or 'sar_filed'.
 *
 * Required env var: RESEND_API_KEY
 * From address: Requires a verified domain in Resend, OR use onboarding@resend.dev for testing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(s) {
          try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  under_review: 'Under Review',
  escalated: 'Escalated',
  sar_filed: 'SAR Filed',
  closed: 'Closed',
};

async function sendStatusEmail(to: string, caseTitle: string, newStatus: string, caseId: string) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return; // email disabled — no key configured

  const statusLabel = STATUS_LABELS[newStatus] ?? newStatus;
  const isSAR = newStatus === 'sar_filed';
  const accentColor = isSAR ? '#ff3b3b' : '#ff8c00';
  const caseUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://clear-chain-peach.vercel.app'}/dashboard/cases/${caseId}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#00080f;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#00080f;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#001824;border:1px solid rgba(6,182,212,0.08);border-radius:4px;">
          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid rgba(6,182,212,0.08);">
              <span style="font-family:monospace;font-size:13px;letter-spacing:0.2em;color:#06b6d4;font-weight:700;">CLEARCHAIN</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <div style="font-family:monospace;font-size:10px;letter-spacing:0.15em;color:#1e4d5c;margin-bottom:16px;text-transform:uppercase;">Case Status Update</div>
              <h2 style="font-size:20px;font-weight:700;color:#ecfeff;margin:0 0 8px;">${caseTitle}</h2>
              <div style="display:inline-block;padding:4px 12px;background:${accentColor}18;border:1px solid ${accentColor}40;border-radius:2px;font-family:monospace;font-size:11px;letter-spacing:0.1em;color:${accentColor};margin-bottom:24px;">
                ${statusLabel.toUpperCase()}
              </div>
              <p style="font-size:14px;color:#7ec8d8;line-height:1.6;margin:0 0 24px;">
                ${isSAR
                  ? 'This case has been marked <strong style="color:#ecfeff;">SAR Filed</strong>. The Suspicious Activity Report has been logged. Ensure the filing is submitted to FinCEN within the required timeframe.'
                  : 'This case has been <strong style="color:#ecfeff;">escalated</strong> and requires immediate attention from a qualified BSA/AML officer.'}
              </p>
              <a href="${caseUrl}" style="display:inline-block;padding:12px 24px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.3);border-radius:2px;font-family:monospace;font-size:11px;letter-spacing:0.12em;color:#06b6d4;text-decoration:none;">
                VIEW CASE →
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid rgba(6,182,212,0.05);">
              <p style="font-family:monospace;font-size:10px;color:#1e4d5c;margin:0;line-height:1.6;">
                ClearChain · Crypto AML Intelligence<br>
                SAR drafts require qualified BSA/AML officer review before filing. Not legal advice.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? 'ClearChain <onboarding@resend.dev>',
      to: [to],
      subject: `[ClearChain] Case ${statusLabel}: ${caseTitle}`,
      html,
    }),
  }).catch(() => {}); // fire-and-forget — don't fail the status update if email fails
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await getSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
  }

  const { data: caseRow, error } = await supabase
    .from('cases')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !caseRow) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404, headers: CORS });
  }

  return NextResponse.json({ case: caseRow }, { headers: CORS });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await getSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
  }

  let body: { status?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS });
  }

  const VALID_STATUSES = ['open', 'under_review', 'escalated', 'sar_filed', 'closed'];
  if (!body.status || !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400, headers: CORS }
    );
  }

  const { data: updatedCase, error } = await supabase
    .from('cases')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id) // RLS double-check
    .select()
    .single();

  if (error || !updatedCase) {
    return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500, headers: CORS });
  }

  // Fire email for high-priority status changes
  if (body.status === 'escalated' || body.status === 'sar_filed') {
    await sendStatusEmail(user.email!, updatedCase.title as string, body.status, id);
  }

  return NextResponse.json({ case: updatedCase }, { headers: CORS });
}
