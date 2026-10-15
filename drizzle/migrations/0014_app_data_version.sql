ALTER TABLE public.app_data
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
