-- Tradesflowpro v0.9.08: add failed_attempts counter to otp_tokens.
--
-- Impact:
--   * Adds failed_attempts column (default 0) to existing otp_tokens rows.
--   * The send-otp Edge Function increments this on each wrong code submission.
--   * After 5 failures on the same token the token is permanently locked —
--     the client must request a new OTP.
--   * Existing rows are unaffected (NULL → 0 via DEFAULT).
--
-- Rollback:
--   ALTER TABLE public.otp_tokens DROP COLUMN IF EXISTS failed_attempts;

ALTER TABLE public.otp_tokens
  ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0;
