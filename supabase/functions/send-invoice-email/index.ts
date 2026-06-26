import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Verify authenticated user
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'Email service not configured — set RESEND_API_KEY in Supabase secrets' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { to, subject, bodyText, fromName, link, clientFirst, docType, docId, total } = await req.json()

    if (!to || !subject || !bodyText) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, bodyText' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || `TradeFlow <noreply@tradeflow.app>`
    const html = buildHtml({ fromName, clientFirst, docType, docId, link, total })

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: fromEmail, to: [to], subject, text: bodyText, html }),
    })

    const data = await res.json()

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.message || 'Failed to send email' }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ id: data.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

function buildHtml({ fromName, clientFirst, docType, docId, link, total }: {
  fromName?: string; clientFirst?: string; docType?: string; docId?: string; link?: string; total?: string
}): string {
  const name = fromName || 'TradeFlow'
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
      <p style="margin:0;font-size:12px;color:#9ca3af">Generated by TradeFlow</p>
    </div>
  </div>
</body>
</html>`
}

function esc(str: string): string {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
