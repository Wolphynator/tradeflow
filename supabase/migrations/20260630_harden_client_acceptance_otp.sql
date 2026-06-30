-- TradeFlow v0.9.07: bind public document actions to a verified client-email OTP session.
--
-- Impact:
--   * Adds nullable verification/audit metadata to existing otp_tokens rows.
--   * Revokes the legacy browser-callable verify/sign/decline/query RPC signatures.
--   * Adds OTP-session-enforced RPC signatures for estimate and invoice responses.
--   * Existing invoice/estimate data is not changed.
--
-- Rollback:
--   1. Redeploy the previous frontend and send-otp Edge Function.
--   2. Re-grant the legacy RPC signatures to anon only if an emergency rollback requires it.
--   3. Drop the new RPC overloads and helper functions defined below.
--   4. The nullable otp_tokens columns may remain safely for audit retention, or be dropped
--      after confirming their data is no longer required.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.otp_tokens
  ADD COLUMN IF NOT EXISTS document_type TEXT,
  ADD COLUMN IF NOT EXISTS document_id UUID,
  ADD COLUMN IF NOT EXISTS client_email TEXT,
  ADD COLUMN IF NOT EXISTS verified_email TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS request_ip TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS document_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_tokens_verification_token_hash
  ON public.otp_tokens (verification_token_hash)
  WHERE verification_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_otp_tokens_document_verification
  ON public.otp_tokens (share_token, document_type, document_id, verified_at)
  WHERE verified_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.document_acceptance_hash(
  p_document_type TEXT,
  p_document_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  IF p_document_type = 'estimate' THEN
    SELECT encode(
      digest(
        convert_to(
          concat_ws('|',
            'estimate',
            e.id::TEXT,
            COALESCE(e.number, ''),
            lower(trim(COALESCE(e.client_email, ''))),
            COALESCE(e.total::TEXT, ''),
            COALESCE(e.updated_at, e.created_at)::TEXT
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    INTO v_hash
    FROM public.estimates e
    WHERE e.id = p_document_id;
  ELSIF p_document_type = 'invoice' THEN
    SELECT encode(
      digest(
        convert_to(
          concat_ws('|',
            'invoice',
            i.id::TEXT,
            COALESCE(i.number, ''),
            lower(trim(COALESCE(i.client_email, ''))),
            COALESCE(i.total::TEXT, ''),
            COALESCE(i.updated_at, i.created_at)::TEXT
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    INTO v_hash
    FROM public.invoices i
    WHERE i.id = p_document_id;
  END IF;

  RETURN v_hash;
END;
$$;

REVOKE ALL ON FUNCTION public.document_acceptance_hash(TEXT, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_document_otp_context(p_share_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_document_id UUID;
  v_document_type TEXT;
  v_client_email TEXT;
  v_document_hash TEXT;
BEGIN
  IF p_share_token IS NULL OR length(p_share_token) <> 32 THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  SELECT e.id, 'estimate', lower(trim(e.client_email))
  INTO v_document_id, v_document_type, v_client_email
  FROM public.estimates e
  WHERE e.share_token = p_share_token;

  IF v_document_id IS NULL THEN
    SELECT i.id, 'invoice', lower(trim(i.client_email))
    INTO v_document_id, v_document_type, v_client_email
    FROM public.invoices i
    WHERE i.share_token = p_share_token;
  END IF;

  IF v_document_id IS NULL OR v_client_email IS NULL OR v_client_email = '' THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  v_document_hash := public.document_acceptance_hash(v_document_type, v_document_id);

  RETURN jsonb_build_object(
    'success', true,
    'document_id', v_document_id,
    'document_type', v_document_type,
    'client_email', v_client_email,
    'document_hash', v_document_hash
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_document_otp_context(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_document_otp_context(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_document_otp(
  p_share_token TEXT,
  p_verification_token TEXT,
  p_document_type TEXT,
  p_document_id UUID,
  p_client_email TEXT,
  p_document_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp public.otp_tokens%ROWTYPE;
BEGIN
  IF p_verification_token IS NULL OR length(p_verification_token) < 32 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email verification required');
  END IF;

  SELECT *
  INTO v_otp
  FROM public.otp_tokens
  WHERE verification_token_hash = encode(
      digest(convert_to(p_verification_token, 'UTF8'), 'sha256'),
      'hex'
    )
    AND share_token = p_share_token
    AND document_type = p_document_type
    AND document_id = p_document_id
    AND lower(trim(verified_email)) = lower(trim(p_client_email))
    AND document_hash = p_document_hash
    AND verified_at IS NOT NULL
    AND verified_at >= now() - interval '15 minutes'
    AND consumed_at IS NULL
  FOR UPDATE;

  IF v_otp.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email verification required or expired');
  END IF;

  UPDATE public.otp_tokens
  SET consumed_at = now()
  WHERE id = v_otp.id;

  RETURN jsonb_build_object(
    'success', true,
    'client_email', lower(trim(p_client_email)),
    'verified_email', lower(trim(v_otp.verified_email)),
    'verified_at', v_otp.verified_at,
    'request_ip', v_otp.request_ip,
    'user_agent', v_otp.user_agent,
    'document_hash', v_otp.document_hash
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_document_otp(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;

-- Remove every anonymous bypass through the old frontend-only OTP flow.
REVOKE EXECUTE ON FUNCTION public.verify_otp(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sign_estimate(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decline_estimate(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.query_document(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sign_estimate(
  p_token TEXT,
  p_signature TEXT,
  p_signed_by TEXT,
  p_verification_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estimate public.estimates%ROWTYPE;
  v_verification JSONB;
  v_document_hash TEXT;
BEGIN
  IF p_signature IS NULL OR length(p_signature) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Signature data missing');
  END IF;

  IF p_signed_by IS NULL OR trim(p_signed_by) = '' OR length(trim(p_signed_by)) > 120 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valid signer name required');
  END IF;

  SELECT *
  INTO v_estimate
  FROM public.estimates
  WHERE share_token = p_token
    AND status IN ('Sent', 'Draft', 'Viewed')
    AND signed_at IS NULL
    AND declined_at IS NULL
  FOR UPDATE;

  IF v_estimate.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Estimate not found or already completed');
  END IF;

  v_document_hash := public.document_acceptance_hash('estimate', v_estimate.id);
  v_verification := public.consume_document_otp(
    p_token,
    p_verification_token,
    'estimate',
    v_estimate.id,
    v_estimate.client_email,
    v_document_hash
  );

  IF NOT COALESCE((v_verification->>'success')::BOOLEAN, false) THEN
    RETURN v_verification;
  END IF;

  UPDATE public.estimates
  SET signature_data = p_signature,
      signed_at = now(),
      signed_by = trim(p_signed_by),
      status = 'Accepted'
  WHERE id = v_estimate.id;

  PERFORM public.log_activity(
    v_estimate.business_id,
    'estimate',
    v_estimate.id,
    'signed',
    v_verification || jsonb_build_object(
      'document_id', v_estimate.id,
      'signed_by', trim(p_signed_by),
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object('success', true, 'estimate_id', v_estimate.id);
END;
$$;

REVOKE ALL ON FUNCTION public.sign_estimate(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_estimate(TEXT, TEXT, TEXT, TEXT) TO anon;

CREATE OR REPLACE FUNCTION public.sign_invoice(
  p_token TEXT,
  p_signature TEXT,
  p_signed_by TEXT,
  p_verification_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_verification JSONB;
  v_document_hash TEXT;
BEGIN
  IF p_signature IS NULL OR length(p_signature) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Signature data missing');
  END IF;

  IF p_signed_by IS NULL OR trim(p_signed_by) = '' OR length(trim(p_signed_by)) > 120 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valid signer name required');
  END IF;

  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE share_token = p_token
    AND signed_at IS NULL
    AND position('(ref ' IN lower(number)) = 0
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found or already signed');
  END IF;

  v_document_hash := public.document_acceptance_hash('invoice', v_invoice.id);
  v_verification := public.consume_document_otp(
    p_token,
    p_verification_token,
    'invoice',
    v_invoice.id,
    v_invoice.client_email,
    v_document_hash
  );

  IF NOT COALESCE((v_verification->>'success')::BOOLEAN, false) THEN
    RETURN v_verification;
  END IF;

  UPDATE public.invoices
  SET signature_data = p_signature,
      signed_at = now(),
      signed_by = trim(p_signed_by)
  WHERE id = v_invoice.id;

  PERFORM public.log_activity(
    v_invoice.business_id,
    'invoice',
    v_invoice.id,
    'signed',
    v_verification || jsonb_build_object(
      'document_id', v_invoice.id,
      'signed_by', trim(p_signed_by),
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice.id);
END;
$$;

REVOKE ALL ON FUNCTION public.sign_invoice(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_invoice(TEXT, TEXT, TEXT, TEXT) TO anon;

CREATE OR REPLACE FUNCTION public.decline_estimate(
  p_token TEXT,
  p_reason TEXT,
  p_comment TEXT,
  p_verification_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estimate public.estimates%ROWTYPE;
  v_verification JSONB;
  v_document_hash TEXT;
BEGIN
  SELECT *
  INTO v_estimate
  FROM public.estimates
  WHERE share_token = p_token
    AND status IN ('Sent', 'Draft', 'Viewed')
    AND signed_at IS NULL
    AND declined_at IS NULL
  FOR UPDATE;

  IF v_estimate.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Estimate not found or already completed');
  END IF;

  v_document_hash := public.document_acceptance_hash('estimate', v_estimate.id);
  v_verification := public.consume_document_otp(
    p_token,
    p_verification_token,
    'estimate',
    v_estimate.id,
    v_estimate.client_email,
    v_document_hash
  );

  IF NOT COALESCE((v_verification->>'success')::BOOLEAN, false) THEN
    RETURN v_verification;
  END IF;

  UPDATE public.estimates
  SET status = 'Declined',
      declined_at = now(),
      declined_reason = COALESCE(NULLIF(trim(p_reason), ''), NULLIF(trim(p_comment), ''))
  WHERE id = v_estimate.id;

  PERFORM public.log_activity(
    v_estimate.business_id,
    'estimate',
    v_estimate.id,
    'declined',
    v_verification || jsonb_build_object(
      'document_id', v_estimate.id,
      'reason', p_reason,
      'comment', p_comment,
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object('success', true, 'estimate_id', v_estimate.id);
END;
$$;

REVOKE ALL ON FUNCTION public.decline_estimate(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_estimate(TEXT, TEXT, TEXT, TEXT) TO anon;

CREATE OR REPLACE FUNCTION public.query_document(
  p_token TEXT,
  p_doc_type TEXT,
  p_message TEXT,
  p_client_name TEXT,
  p_verification_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_document_id UUID;
  v_business_id UUID;
  v_client_email TEXT;
  v_verification JSONB;
  v_document_hash TEXT;
BEGIN
  IF p_message IS NULL OR trim(p_message) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message is required');
  END IF;

  IF p_doc_type = 'estimate' THEN
    SELECT e.id, e.business_id, e.client_email
    INTO v_document_id, v_business_id, v_client_email
    FROM public.estimates e
    WHERE e.share_token = p_token
    FOR UPDATE;
  ELSIF p_doc_type = 'invoice' THEN
    SELECT i.id, i.business_id, i.client_email
    INTO v_document_id, v_business_id, v_client_email
    FROM public.invoices i
    WHERE i.share_token = p_token
    FOR UPDATE;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid document type');
  END IF;

  IF v_document_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Document not found');
  END IF;

  v_document_hash := public.document_acceptance_hash(p_doc_type, v_document_id);
  v_verification := public.consume_document_otp(
    p_token,
    p_verification_token,
    p_doc_type,
    v_document_id,
    v_client_email,
    v_document_hash
  );

  IF NOT COALESCE((v_verification->>'success')::BOOLEAN, false) THEN
    RETURN v_verification;
  END IF;

  IF p_doc_type = 'estimate' THEN
    UPDATE public.estimates
    SET client_query = p_message,
        queried_at = now()
    WHERE id = v_document_id;
  ELSE
    UPDATE public.invoices
    SET client_query = p_message,
        queried_at = now()
    WHERE id = v_document_id;
  END IF;

  PERFORM public.log_activity(
    v_business_id,
    p_doc_type,
    v_document_id,
    'queried',
    v_verification || jsonb_build_object(
      'document_id', v_document_id,
      'client_name', p_client_name,
      'message', p_message,
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object('success', true, 'document_id', v_document_id);
END;
$$;

REVOKE ALL ON FUNCTION public.query_document(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.query_document(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
