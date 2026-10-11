CREATE OR REPLACE FUNCTION public.log_app_data_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    INSERT INTO public.activity_logs (user_id, action, details)
    VALUES (
      CASE
        WHEN TG_OP = 'DELETE' THEN OLD.user_id
        ELSE NEW.user_id
      END,
      CASE TG_OP
        WHEN 'INSERT' THEN 'create'
        WHEN 'UPDATE' THEN 'update'
        WHEN 'DELETE' THEN 'delete'
      END,
      jsonb_build_object(
        'table', TG_TABLE_NAME,
        'id', CASE
          WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)->>'user_id'
          ELSE to_jsonb(NEW)->>'user_id'
        END
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_app_data_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_app_data_changes ON public.app_data;

CREATE TRIGGER trg_log_app_data_changes
AFTER INSERT OR UPDATE OR DELETE ON public.app_data
FOR EACH ROW
EXECUTE FUNCTION public.log_app_data_changes();