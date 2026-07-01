import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tradesflowpro.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }
function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function esc(s: unknown): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function randomDigits(): string {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return String(100000 + (values[0] % 900000))
}

function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405)

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const RESEND_FROM = Deno.env.get('RESEND_FROM_EMAIL') || 'TradeFlow <onboarding@resend.dev>'
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!RESEND_API_KEY || !SUPABASE_URL || !SERVICE_KEY) {
    return json({ success: false, error: 'Email service not configured' }, 500)
  }

  try {
    const body = await req.json()
    const action = String(body?.action || '')
    const shareToken = String(body?.share_token || '').trim()
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
    const requestIp = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null
    const userAgent = req.headers.get('user-agent') || null

    if (!action) return json({ success: false, error: 'Missing action' }, 400)

    if (action === 'send_otp' || action === 'verify_otp') {
      if (!shareToken) {
        return json({ success: false, error: action === 'send_otp' ? 'Document verification is unavailable.' : 'Invalid or expired code. Please try again.' }, 400)
      }

      const { data: context, error: contextError } = await supabase.rpc('get_document_otp_context', {
        p_share_token: shareToken,
      })

      if (contextError || !context?.success) {
        return action === 'send_otp'
          ? json({ success: false, error: 'Document verification is unavailable.' })
          : json({ success: false, error: 'Invalid or expired code. Please try again.' }, 403)
      }

      const savedEmail = normalizeEmail(context.client_email)
      if (!validEmail(savedEmail)) {
        return json({ success: false, error: action === 'send_otp' ? 'Document verification is unavailable.' : 'Invalid or expired code. Please try again.' })
      }

      if (action === 'send_otp') {
        const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString()
        const { data: recentSends, error: countError } = await supabase
          .from('otp_tokens')
          .select('created_at')
          .eq('share_token', shareToken)
          .gte('created_at', windowStart)
          .order('created_at', { ascending: false })

        if (countError) return json({ success: false, error: 'Could not start verification. Please try again.' }, 500)
        const sendCount = recentSends?.length || 0
        if (sendCount >= 4) return json({ success: false, error: 'Too many codes sent. Please try again in 15 minutes.', retry_after_seconds: 900 }, 429)

        const lastSentAt = recentSends?.[0]?.created_at ? new Date(recentSends[0].created_at).getTime() : 0
        const elapsedMs = Date.now() - lastSentAt
        if (lastSentAt && elapsedMs < 10_000) {
          const retryAfter = Math.max(1, Math.ceil((10_000 - elapsedMs) / 1000))
          return json({ success: false, error: `Please wait ${retryAfter} seconds before requesting another code.`, retry_after_seconds: retryAfter }, 429)
        }

        // A newly issued code supersedes every older unused code for this document.
        await supabase
          .from('otp_tokens')
          .update({ used_at: new Date().toISOString() })
          .eq('share_token', shareToken)
          .is('used_at', null)

        const code = randomDigits()
        const codeHash = await sha256(code)
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
        const { data: otpRow, error: insertError } = await supabase
          .from('otp_tokens')
          .insert({
            email: savedEmail,
            code: codeHash,
            share_token: shareToken,
            expires_at: expiresAt,
            document_type: context.document_type,
            document_id: context.document_id,
            client_email: savedEmail,
            request_ip: requestIp,
            user_agent: userAgent,
            document_hash: context.document_hash,
          })
          .select('id')
          .single()

        if (insertError || !otpRow) return json({ success: false, error: 'Failed to create verification code' }, 500)

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: [savedEmail],
            subject: 'Your signature verification code',
            html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)">
    <div style="background:#1a3d2b;padding:24px 32px"><div style="color:#fff;font-size:18px;font-weight:700">Signature Verification</div></div>
    <div style="padding:32px">
      <p style="margin:0 0 8px;font-size:15px;color:#374151">Use this code to verify your identity and respond to your document:</p>
      <div style="font-size:38px;font-weight:800;letter-spacing:10px;text-align:center;padding:24px 16px;background:#f0fdf4;border-radius:10px;color:#15803d;margin:20px 0">${code}</div>
      <p style="margin:0;font-size:13px;color:#6b7280">This code expires in <strong>10 minutes</strong>. If you did not request this, you can safely ignore this email.</p>
    </div>
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center"><p style="margin:0;font-size:12px;color:#9ca3af">Sent via TradeFlow</p></div>
  </div>
</body>
</html>`,
          }),
        })

        if (!emailRes.ok) {
          await supabase.from('otp_tokens').delete().eq('id', otpRow.id)
          return json({ success: false, error: 'Failed to send email' }, 500)
        }

        const sendNumber = sendCount + 1
        return json({
          success: true,
          resend_available_in: sendNumber < 4 ? 10 : 900,
          sends_remaining: Math.max(0, 4 - sendNumber),
        })
      }

      const code = String(body?.code || '').replace(/\s/g, '')
      if (!/^\d{6}$/.test(code)) return json({ success: false, error: 'Invalid or expired code. Please try again.' }, 400)

      const now = new Date().toISOString()

      // Find the active (unexpired, unused) OTP row so we can check and update failed_attempts
      const { data: activeOtp } = await supabase
        .from('otp_tokens')
        .select('id, failed_attempts')
        .eq('share_token', shareToken)
        .eq('email', savedEmail)
        .is('used_at', null)
        .gt('expires_at', now)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (activeOtp && (activeOtp.failed_attempts ?? 0) >= 5) {
        return json({ success: false, error: 'Too many incorrect attempts. Please request a new code.' }, 429)
      }

      const codeHash = await sha256(code)
      const { data: otp, error: otpError } = await supabase
        .from('otp_tokens')
        .select('id')
        .eq('share_token', shareToken)
        .eq('email', savedEmail)
        .eq('code', codeHash)
        .eq('document_type', context.document_type)
        .eq('document_id', context.document_id)
        .eq('document_hash', context.document_hash)
        .is('used_at', null)
        .gt('expires_at', now)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (otpError || !otp) {
        if (activeOtp) {
          await supabase
            .from('otp_tokens')
            .update({ failed_attempts: (activeOtp.failed_attempts ?? 0) + 1 })
            .eq('id', activeOtp.id)
            .is('used_at', null)
        }
        return json({ success: false, error: 'Invalid or expired code. Please try again.' }, 403)
      }

      const verificationToken = randomToken()
      const verificationTokenHash = await sha256(verificationToken)
      const { data: verified, error: verifyError } = await supabase
        .from('otp_tokens')
        .update({
          used_at: now,
          verified_at: now,
          verified_email: savedEmail,
          verification_token_hash: verificationTokenHash,
          request_ip: requestIp,
          user_agent: userAgent,
        })
        .eq('id', otp.id)
        .is('used_at', null)
        .select('id')
        .maybeSingle()

      if (verifyError || !verified) return json({ success: false, error: 'Invalid or expired code. Please try again.' }, 403)
      return json({ success: true, verification_token: verificationToken })
    }

    if (action === 'send_confirmation') {
      const verificationToken = String(body?.verification_token || '')
      if (!verificationToken) return json({ success: false, error: 'Verification required' }, 403)

      const verificationTokenHash = await sha256(verificationToken)
      const { data: otp, error: otpError } = await supabase
        .from('otp_tokens')
        .select('id, verified_email, document_id, document_type')
        .eq('verification_token_hash', verificationTokenHash)
        .not('verified_at', 'is', null)
        .not('consumed_at', 'is', null)
        .is('confirmation_sent_at', null)
        .maybeSingle()

      if (otpError || !otp?.verified_email) return json({ success: false, error: 'Verification required' }, 403)

      const { data: claimed, error: claimError } = await supabase
        .from('otp_tokens')
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq('id', otp.id)
        .is('confirmation_sent_at', null)
        .select('id')
        .maybeSingle()

      if (claimError || !claimed) return json({ success: false, error: 'Confirmation already sent' }, 409)

      const documentTable = otp.document_type === 'invoice' ? 'invoices' : 'estimates'
      const { data: document, error: documentError } = await supabase
        .from(documentTable)
        .select('number, from_name')
        .eq('id', otp.document_id)
        .single()

      if (documentError || !document) {
        await supabase.from('otp_tokens').update({ confirmation_sent_at: null }).eq('id', otp.id)
        return json({ success: false, error: 'Document not found' }, 404)
      }

      const contractorName = String(document.from_name || 'Your contractor').replace(/[\r\n]+/g, ' ').trim()
      const documentNumber = String(document.number || 'your document').replace(/[\r\n]+/g, ' ').trim()
      const name = esc(contractorName)
      const docRef = esc(documentNumber)
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [normalizeEmail(otp.verified_email)],
          subject: `You signed ${documentNumber} — ${contractorName}`,
          html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)">
    <div style="background:#1a3d2b;padding:24px 32px"><div style="color:#fff;font-size:18px;font-weight:700">&#10003; Document Signed</div></div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:15px;color:#374151">You have successfully signed <strong>${docRef}</strong> from <strong>${name}</strong>.</p>
      <p style="margin:0 0 16px;font-size:14px;color:#374151">A copy of the signed document is available via your original link.</p>
      <p style="margin:0;font-size:13px;color:#6b7280">If this was not you or you have any concerns, please contact <strong>${name}</strong> directly.</p>
    </div>
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center"><p style="margin:0;font-size:12px;color:#9ca3af">Sent via TradeFlow</p></div>
  </div>
</body>
</html>`,
        }),
      })

      if (!emailRes.ok) {
        await supabase.from('otp_tokens').update({ confirmation_sent_at: null }).eq('id', otp.id)
        return json({ success: false, error: 'Failed to send confirmation' }, 502)
      }
      return json({ success: true })
    }

    return json({ success: false, error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('send-otp error:', e instanceof Error ? e.message : 'Unknown error')
    return json({ success: false, error: 'Could not complete verification. Please try again.' }, 500)
  }
})
