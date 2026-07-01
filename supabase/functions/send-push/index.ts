import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tradesflowpro.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(JSON.stringify({ error: 'Push not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { token, event, title, body, client_name, doc_number, entity_type } = await req.json()
    if (!token) {
      return new Response(JSON.stringify({ error: 'token required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Find the business from the share token (check invoices then estimates)
    let bizId: string | null = null
    let entityId: string | null = null
    const { data: inv } = await sb.from('invoices').select('id, business_id').eq('share_token', token).maybeSingle()
    if (inv) { bizId = inv.business_id; entityId = inv.id }
    if (!bizId) {
      const { data: est } = await sb.from('estimates').select('id, business_id').eq('share_token', token).maybeSingle()
      if (est) { bizId = est.business_id; entityId = est.id }
    }
    if (!bizId) {
      return new Response(JSON.stringify({ ok: true, skipped: 'token not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Log activity for 'opened' event
    if (event === 'opened' && bizId && entityId) {
      const resolvedType = entity_type || (inv ? 'invoice' : 'estimate')
      await sb.rpc('log_activity', {
        p_business_id: bizId,
        p_entity_type: resolvedType,
        p_entity_id: entityId,
        p_action: 'viewed',
        p_metadata: {
          client_name: client_name || 'Client',
          doc_number: doc_number || '',
        },
      })
    }

    const { data: biz } = await sb.from('businesses').select('push_subscription').eq('id', bizId).maybeSingle()
    if (!biz?.push_subscription) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no subscription' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    webpush.setVapidDetails('mailto:wolphy.pwi@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)

    await webpush.sendNotification(
      biz.push_subscription,
      JSON.stringify({ title: title || 'TradeFlow', body: body || '', tag: event || 'tradeflow' })
    )

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
