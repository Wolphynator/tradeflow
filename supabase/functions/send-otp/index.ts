import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const RESEND_FROM = Deno.env.get('RESEND_FROM_EMAIL') || 'TradeFlow <onboarding@resend.dev>'
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ success: false, error: 'Email service not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { action, email, share_token, contractor_name, doc_id } = await req.json()

    if (!email || !action) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    // ── SEND OTP ──────────────────────────────────────────────────────────────
    if (action === 'send_otp') {
      if (!share_token) {
        return new Response(JSON.stringify({ success: false, error: 'Missing share_token' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Rate limit: max 3 OTPs per share_token in the last 10 minutes
      const { count } = await supabase
        .from('otp_tokens')
        .select('*', { count: 'exact', head: true })
        .eq('share_token', share_token)
        .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())

      if ((count || 0) >= 3) {
        return new Response(JSON.stringify({ success: false, error: 'Too many attempts. Please try again in 10 minutes.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString()
      const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString()

      const { error: insertErr } = await supabase
        .from('otp_tokens')
        .insert({ email: email.toLowerCase().trim(), code, share_token, expires_at })

      if (insertErr) {
        return new Response(JSON.stringify({ success: false, error: 'Failed to create verification code' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [email],
          subject: 'Your signature verification code',
          html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)">
    <div style="background:#1a3d2b;padding:24px 32px">
      <div style="color:#fff;font-size:18px;font-weight:700">Signature Verification</div>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 8px;font-size:15px;color:#374151">Use this code to verify your identity and sign your document:</p>
      <div style="font-size:38px;font-weight:800;letter-spacing:10px;text-align:center;padding:24px 16px;background:#f0fdf4;border-radius:10px;color:#15803d;margin:20px 0">${code}</div>
      <p style="margin:0;font-size:13px;color:#6b7280">This code expires in <strong>10 minutes</strong>. If you did not request this, you can safely ignore this email.</p>
    </div>
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center">
      <p style="margin:0;font-size:12px;color:#9ca3af">Sent via TradeFlow</p>
    </div>
  </div>
</body>
</html>`,
        }),
      })

      if (!emailRes.ok) {
        return new Response(JSON.stringify({ success: false, error: 'Failed to send email' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── SEND CONFIRMATION ─────────────────────────────────────────────────────
    if (action === 'send_confirmation') {
      const name = esc(contractor_name || 'Your contractor')
      const docRef = esc(doc_id || 'your document')

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [email],
          subject: `You signed ${doc_id || 'a document'} — ${contractor_name || 'TradeFlow'}`,
          html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)">
    <div style="background:#1a3d2b;padding:24px 32px">
      <div style="color:#fff;font-size:18px;font-weight:700">&#10003; Document Signed</div>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:15px;color:#374151">You have successfully signed <strong>${docRef}</strong> from <strong>${name}</strong>.</p>
      <p style="margin:0 0 16px;font-size:14px;color:#374151">A copy of the signed document is available via your original link.</p>
      <p style="margin:0;font-size:13px;color:#6b7280">If this was not you or you have any concerns, please contact <strong>${name}</strong> directly.</p>
    </div>
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center">
      <p style="margin:0;font-size:12px;color:#9ca3af">Sent via TradeFlow</p>
    </div>
  </div>
</body>
</html>`,
        }),
      })

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: false, error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
