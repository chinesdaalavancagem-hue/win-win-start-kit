DROP TRIGGER IF EXISTS trg_log_app_data_changes ON public.app_data;
DROP FUNCTION IF EXISTS public.log_app_data_changes();