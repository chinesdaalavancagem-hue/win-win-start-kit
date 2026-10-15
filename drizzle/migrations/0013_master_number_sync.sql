-- Configuração de sincronização seletiva controlada pela conta Master.
-- A tabela não é acessível diretamente por clientes; leitura/escrita passam pela API server-side.
CREATE TABLE IF NOT EXISTS public.master_number_sync (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  allowed_fields jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allowed_fields) = 'array'),
  published_values jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(published_values) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.master_number_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.master_number_sync FROM anon, authenticated;
GRANT ALL ON TABLE public.master_number_sync TO service_role;
