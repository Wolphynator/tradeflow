import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = new Set(['https://tradesflowpro.com', 'https://tradeflow-5eh.pages.dev'])

function getCors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://tradesflowpro.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function json(body: Record<string, unknown>, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

function normalizeEmail(v: unknown): string {
  return String(v || '').trim().toLowerCase()
}

function esc(s: unknown): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

Deno.serve(async (req) => {
  const cors = getCors(req)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors)

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!RESEND_API_KEY || !SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: 'Email service not configured' }, 500, cors)
  }

  // 1 — Require a valid user JWT
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Unauthorised' }, 401, cors)

  const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: { user }, error: authErr } = await serviceClient.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorised' }, 401, cors)

  try {
    const body = await req.json()
    const shareToken = String(body?.shareToken || '').trim()
    const docType = String(body?.docType || 'Invoice')
    const fromName = String(body?.fromName || '').replace(/[\r\n]+/g, ' ').trim()
    const clientFirst = String(body?.clientFirst || '').replace(/[\r\n]+/g, ' ').trim()
    const subject = String(body?.subject || '').replace(/[\r\n]+/g, ' ').trim()
    const total = String(body?.total || '').replace(/[\r\n]+/g, ' ').trim()

    if (!shareToken || !subject) {
      return json({ error: 'Missing required fields: shareToken, subject' }, 400, cors)
    }

    // 2 — Look up the document by share token
    const table = docType === 'Estimate' ? 'estimates' : 'invoices'
    const { data: doc, error: docErr } = await serviceClient
      .from(table)
      .select('id, business_id, client_email, number, share_token')
      .eq('share_token', shareToken)
      .maybeSingle()

    if (docErr || !doc) return json({ error: 'Document not found' }, 404, cors)

    // 3 — Verify the caller belongs to this document's business
    const { data: membership, error: memErr } = await serviceClient
      .from('business_members')
      .select('business_id')
      .eq('user_id', user.id)
      .eq('business_id', doc.business_id)
      .maybeSingle()

    if (memErr || !membership) return json({ error: 'Unauthorised' }, 403, cors)

    // 4 — Recipient is always the stored client_email — never caller-supplied
    const toEmail = normalizeEmail(doc.client_email)
    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      return json({ error: 'Document has no valid client email address' }, 422, cors)
    }

    // 5 — Build share link from stored share_token — never caller-supplied
    const docPrefix = docType === 'Estimate' ? 'est' : 'inv'
    const link = `https://tradesflowpro.com/#view/${docPrefix}-${doc.share_token}`
    const docId = doc.number || ''

    // 6 — Build email body server-side
    const isEst = docType === 'Estimate'
    const bodyText = isEst
      ? `Hi ${clientFirst || 'there'},\n\nThank you for giving us the opportunity to quote for your project. Please find your estimate (${docId}) at the link below:\n\n${link}\n\n${total ? 'Estimate total: ' + total + '\n\n' : ''}We would love the chance to work with you. If you have any questions or would like to discuss the details, please don't hesitate to get in touch.\n\nKind regards,\n${fromName}`
      : `Hi ${clientFirst || 'there'},\n\nIt has been a pleasure working with you. Please find your invoice (${docId}) at the link below:\n\n${link}\n\n${total ? 'Total: ' + total + '\n\n' : ''}If you have any questions, feel free to get in touch. We look forward to working with you again.\n\nKind regards,\n${fromName}`

    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'Tradesflowpro <onboarding@resend.dev>'
    const html = buildHtml({ fromName, clientFirst, docType, docId, link, total })

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [toEmail], subject, text: bodyText, html }),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({})) as Record<string, unknown>
      console.error('Resend error:', res.status, errData.name)
      return json({ error: 'Failed to send email. Please try again.' }, 502, cors)
    }

    const data = await res.json() as { id?: string }
    return json({ id: data.id ?? '' }, 200, cors)
  } catch (e) {
    console.error('send-invoice-email error:', e instanceof Error ? e.message : 'Unknown error')
    return json({ error: 'Could not send email. Please try again.' }, 500, cors)
  }
})

function buildHtml({ fromName, clientFirst, docType, docId, link, total }: {
  fromName?: string; clientFirst?: string; docType?: string; docId?: string; link?: string; total?: string
}): string {
  const name = fromName || 'Tradesflowpro'
  const greeting = clientFirst ? `Hi ${esc(clientFirst)},` : 'Hi,'
  const docLabel = docType === 'Estimate' ? 'estimate' : 'invoice'
  const buttonText = docType === 'Estimate' ? 'View Estimate' : 'View Invoice'

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif">
  <div style="max-width:560px;margin:32px auto 48px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)">
    <div style="background:#1a3d2b;padding:24px 32px">
      <div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-.3px">${esc(name)}</div>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px;color:#111827;font-weight:600">${greeting}</p>
      <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6">
        Please find your ${docLabel}${docId ? ` <strong>${esc(docId)}</strong>` : ''} from <strong>${esc(name)}</strong> at the link below.
      </p>
      ${total ? `<p style="margin:0 0 24px;font-size:15px;color:#374151">Total: <strong>${esc(total)}</strong></p>` : '<p style="margin:0 0 24px"></p>'}
      ${link ? `<div style="text-align:center;margin:8px 0 28px">
        <a href="${esc(link)}" style="display:inline-block;background:#1a3d2b;color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:700">${buttonText}</a>
      </div>` : ''}
      <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6">Thank you for your business.</p>
      <p style="margin:4px 0 0;font-size:14px;color:#9ca3af">${esc(name)}</p>
    </div>
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center">
      <p style="margin:0;font-size:12px;color:#9ca3af">Sent via Tradesflowpro</p>
    </div>
  </div>
</body>
</html>`
}
