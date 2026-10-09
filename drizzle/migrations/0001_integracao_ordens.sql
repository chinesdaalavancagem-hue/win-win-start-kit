CREATE TABLE public.integration_tokens (
  user_id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.integration_tokens TO authenticated;
GRANT ALL ON public.integration_tokens TO service_role;
ALTER TABLE public.integration_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own token read" ON public.integration_tokens FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.order_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  external_id text NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  mirror_side text NOT NULL CHECK (mirror_side IN ('buy','sell')),
  qty numeric NOT NULL CHECK (qty > 0),
  price numeric,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','done','error')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_id)
);
CREATE INDEX order_queue_user_status ON public.order_queue (user_id, status, created_at);
GRANT SELECT ON public.order_queue TO authenticated;
GRANT ALL ON public.order_queue TO service_role;
ALTER TABLE public.order_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own orders read" ON public.order_queue FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.is_approved(auth.uid()));