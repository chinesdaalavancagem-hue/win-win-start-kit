CREATE TABLE public.prop_firms (
 id text PRIMARY KEY CHECK (id IN ('lucid-trading', 'tradeify', 'my-funded-futures')),
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
 affiliate_url text NOT NULL DEFAULT '' CHECK (char_length(affiliate_url) <= 2048 AND (affiliate_url = '' OR affiliate_url ~ '^https://[^[:space:]]+$')),
 coupon text NOT NULL DEFAULT '' CHECK (char_length(coupon) <= 80),
 account_sizes integer[] NOT NULL DEFAULT '{}' CHECK (cardinality(account_sizes) <= 20 AND (cardinality(account_sizes) = 0 OR (0 < ALL(account_sizes) AND 10000000 >= ALL(account_sizes)))),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.prop_firms TO authenticated;
GRANT ALL ON public.prop_firms TO service_role;
ALTER TABLE public.prop_firms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approved traders read firms" ON public.prop_firms FOR SELECT TO authenticated USING (public.is_approved(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "master inserts firms" ON public.prop_firms FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "master updates firms" ON public.prop_firms FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));