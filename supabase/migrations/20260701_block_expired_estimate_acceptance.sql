-- Block acceptance of expired estimates without modifying existing document data.
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

  IF v_estimate.valid_until IS NOT NULL
     AND v_estimate.valid_until < (now() AT TIME ZONE 'Europe/London')::date THEN
    RETURN jsonb_build_object('success', false, 'error', 'This estimate has expired and can no longer be accepted');
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
