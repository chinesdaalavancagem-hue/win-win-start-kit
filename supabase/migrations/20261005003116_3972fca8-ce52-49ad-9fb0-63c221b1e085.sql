ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false;
