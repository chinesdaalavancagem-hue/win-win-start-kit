CREATE TABLE public.ai_analysis_daily_usage (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0 AND used <= 3),
  PRIMARY KEY (user_id, usage_date)
);

REVOKE ALL ON public.ai_analysis_daily_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_analysis_daily_usage TO service_role;
ALTER TABLE public.ai_analysis_daily_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_ai_analysis_quota(p_user_id uuid, p_limit integer DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used integer;
BEGIN
  IF p_user_id IS NULL OR p_limit < 1 OR p_limit > 3 THEN
    RAISE EXCEPTION 'invalid quota request';
  END IF;

  INSERT INTO public.ai_analysis_daily_usage (user_id, usage_date, used)
  VALUES (p_user_id, (now() AT TIME ZONE 'UTC')::date, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET used = public.ai_analysis_daily_usage.used + 1
  WHERE public.ai_analysis_daily_usage.used < p_limit
  RETURNING used INTO v_used;

  IF v_used IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN p_limit - v_used;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_ai_analysis_quota(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_analysis_quota(uuid, integer) TO service_role;

-- Registra apenas o evento de conclusão, sem guardar o conteúdo da análise.
ALTER TABLE public.activity_logs DROP CONSTRAINT IF EXISTS activity_logs_action_check;
ALTER TABLE public.activity_logs
  ADD CONSTRAINT activity_logs_action_check
  CHECK (action IN ('login.success', 'login.failed', 'logout', 'create', 'update', 'delete', 'ai.analysis.completed'));
