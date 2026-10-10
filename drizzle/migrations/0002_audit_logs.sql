-- Audit trail for security, strategy changes and integration diagnostics.
-- Access is mediated by server routes using the service-role client.
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('auth', 'strategy', 'integration', 'navigation', 'system', 'ui')),
  action text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failed', 'denied', 'started', 'unknown')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_user_created_at_idx
  ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_category_created_at_idx
  ON public.audit_logs (category, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- No direct browser access. Server routes authenticate the caller and enforce
-- admin checks before using the service-role client.
REVOKE ALL ON TABLE public.audit_logs FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO service_role;

COMMENT ON TABLE public.audit_logs IS
  'Append-oriented audit events for Win or Win; never store passwords, tokens, or secret values here.';
