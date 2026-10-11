CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  action text NOT NULL CHECK (action IN ('login.success','login.failed','logout','create','update','delete')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(details::text) <= 4096),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert own activity" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "admin read activity" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX activity_logs_created_at_idx ON public.activity_logs (created_at DESC);
CREATE INDEX activity_logs_user_id_idx ON public.activity_logs (user_id);

CREATE OR REPLACE FUNCTION public.log_failed_login(attempted_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := left(lower(trim(coalesce(attempted_email, ''))), 254);
BEGIN
  -- Limite simples: no máximo 5 registros por e-mail a cada 5 minutos
  -- e no máximo 200 falhas no total por minuto.
  IF (SELECT count(*) FROM public.activity_logs
      WHERE action = 'login.failed'
        AND created_at > now() - interval '5 minutes'
        AND details->>'attempted_email' = v_email) >= 5 THEN
    RETURN;
  END IF;
  IF (SELECT count(*) FROM public.activity_logs
      WHERE action = 'login.failed'
        AND created_at > now() - interval '1 minute') >= 200 THEN
    RETURN;
  END IF;
  INSERT INTO public.activity_logs (user_id, action, details)
  VALUES (NULL, 'login.failed', jsonb_build_object('attempted_email', v_email));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_failed_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_failed_login(text) TO anon, authenticated;