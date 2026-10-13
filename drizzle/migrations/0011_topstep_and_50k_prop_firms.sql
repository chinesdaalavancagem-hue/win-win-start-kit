-- Add Topstep and initialize the affiliate links.
-- The account size is intentionally fixed at USD 50,000 for every firm.
ALTER TABLE public.prop_firms DROP CONSTRAINT IF EXISTS prop_firms_id_check;
ALTER TABLE public.prop_firms
  ADD CONSTRAINT prop_firms_id_check
  CHECK (id IN ('lucid-trading', 'tradeify', 'my-funded-futures', 'topstep'));

INSERT INTO public.prop_firms (id, name, affiliate_url, coupon, account_sizes)
VALUES
  ('lucid-trading', 'Lucid Trading', 'https://lucidtrading.com/?ref=cupommesasprop&utm_source=cupommesasprop&utm_medium=afiliado&utm_campaign=lucidtrading', '', ARRAY[50000]),
  ('tradeify', 'Tradeify', 'https://tradeify.co/?ref=TWC&utm_source=cupommesasprop&utm_medium=afiliado&utm_campaign=tradeify', '', ARRAY[50000]),
  ('my-funded-futures', 'My Funded Futures', 'https://myfundedfutures.com/challenge?ref=355&utm_source=cupommesasprop&utm_campaign=myfundedfutures&utm_medium=afiliado', '', ARRAY[50000]),
  ('topstep', 'Topstep', 'https://www.topstep.com/?ref=TWC&utm_source=cupommesasprop&utm_medium=afiliado&utm_campaign=topstep&utm_content=topstep', '', ARRAY[50000])
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  affiliate_url = CASE
    WHEN COALESCE(public.prop_firms.affiliate_url, '') = ''
      OR public.prop_firms.affiliate_url IN (
        'https://lucidtrading.com/',
        'https://tradeify.co/',
        'https://myfundedfutures.com/',
        'https://www.topstep.com/'
      )
    THEN EXCLUDED.affiliate_url
    ELSE public.prop_firms.affiliate_url
  END,
  account_sizes = EXCLUDED.account_sizes,
  updated_at = now();
