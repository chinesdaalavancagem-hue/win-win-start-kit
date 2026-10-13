-- SQL DE REVISÃO — não aplicar até a aprovação explícita.
-- Esta tabela só pode ser consultada/alterada pela camada de servidor com service_role.

CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  terms_version text NOT NULL
    CHECK (char_length(terms_version) BETWEEN 1 AND 64),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  device_hash text NOT NULL
    CHECK (device_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT terms_acceptances_user_version_unique UNIQUE (user_id, terms_version)
);

CREATE INDEX IF NOT EXISTS terms_acceptances_user_accepted_at_idx
  ON public.terms_acceptances (user_id, accepted_at DESC);

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.terms_acceptances FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.terms_acceptances TO service_role;

COMMENT ON TABLE public.terms_acceptances IS
  'Versioned terms acceptance records. Access is mediated by trusted server code using service_role; raw IP addresses are not stored.';
