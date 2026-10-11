CREATE OR REPLACE FUNCTION public.log_failed_login(attempted_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := left(lower(trim(coalesce(attempted_email, ''))), 254);
BEGIN
  IF v_email !~ '^[^\s@]*@[^\s@]*\.[^\s@]*$' THEN
    v_email := 'formato inválido';
  END IF;
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
$function$;