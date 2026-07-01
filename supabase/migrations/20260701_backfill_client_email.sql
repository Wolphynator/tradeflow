-- Backfill client_email from client_address for estimates where client_email is NULL
-- The email is embedded in client_address as part of the address HTML string
UPDATE public.estimates
SET client_email = lower(trim(
  (regexp_match(client_address, '[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'))[1]
))
WHERE client_email IS NULL
  AND client_address IS NOT NULL
  AND client_address ~ '[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}';

-- Same backfill for invoices
UPDATE public.invoices
SET client_email = lower(trim(
  (regexp_match(client_address, '[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'))[1]
))
WHERE client_email IS NULL
  AND client_address IS NOT NULL
  AND client_address ~ '[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}';

-- Update get_document_otp_context to also fall back to parsing client_address
-- so future documents with null client_email but email in address can still use OTP
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
  v_client_address TEXT;
  v_document_hash TEXT;
BEGIN
  IF p_share_token IS NULL OR length(p_share_token) <> 32 THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  SELECT e.id, 'estimate', lower(trim(e.client_email)), e.client_address
  INTO v_document_id, v_document_type, v_client_email, v_client_address
  FROM public.estimates e
  WHERE e.share_token = p_share_token;

  IF v_document_id IS NULL THEN
    SELECT i.id, 'invoice', lower(trim(i.client_email)), i.client_address
    INTO v_document_id, v_document_type, v_client_email, v_client_address
    FROM public.invoices i
    WHERE i.share_token = p_share_token;
  END IF;

  IF v_document_id IS NULL THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  -- Fallback: extract email from client_address if client_email is null
  IF (v_client_email IS NULL OR v_client_email = '') AND v_client_address IS NOT NULL THEN
    v_client_email := lower(trim(
      (regexp_match(v_client_address, '[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'))[1]
    ));
  END IF;

  IF v_client_email IS NULL OR v_client_email = '' THEN
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
