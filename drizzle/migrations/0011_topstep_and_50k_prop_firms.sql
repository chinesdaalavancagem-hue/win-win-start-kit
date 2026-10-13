-- Add Topstep and initialize the official/referral links.
-- The account size is intentionally fixed at USD 50,000 for every firm.
ALTER TABLE public.prop_firms DROP CONSTRAINT IF EXISTS prop_firms_id_check;
ALTER TABLE public.prop_firms
  ADD CONSTRAINT prop_firms_id_check
  CHECK (id IN ('lucid-trading', 'tradeify', 'my-funded-futures', 'topstep'));

INSERT INTO public.prop_firms (id, name, affiliate_url, coupon, account_sizes)
VALUES
  ('lucid-trading', 'Lucid Trading', 'https://lucidtrading.com/', '', ARRAY[50000]),
  ('tradeify', 'Tradeify', 'https://tradeify.co/', '', ARRAY[50000]),
  ('my-funded-futures', 'My Funded Futures', 'https://myfundedfutures.com/', '', ARRAY[50000]),
  ('topstep', 'Topstep', 'https://social.topstep.com/trader/840014e6-0c9c-4f05-9326-2501c87b9b44', '', ARRAY[50000])
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  affiliate_url = CASE
    WHEN public.prop_firms.id = 'topstep' THEN EXCLUDED.affiliate_url
    WHEN public.prop_firms.affiliate_url = '' THEN EXCLUDED.affiliate_url
    ELSE public.prop_firms.affiliate_url
  END,
  account_sizes = EXCLUDED.account_sizes,
  updated_at = now();
