-- Migration: 2026-07-16  portfolio_holdings — drop over-narrow currency CHECK
--
-- WHY: Phase 2.11 portfolio write path. Same bug class as the insurance CHECKs.
-- The currency CHECK was derived from the 1038 seeded rows (MYR/AUD/SGD/USD),
-- but PortfolioFormModal's CURRENCIES lets an advisor pick MYR/USD/SGD/GBP/EUR/
-- AUD/JPY. A Supabase-path write with GBP/EUR/JPY (all valid in the Notion
-- free-select) would throw a constraint violation. Applying the same decision
-- as the insurance CHECKs (2026-07-16): drop it to match Notion's free-form
-- select.
--
-- Rollback (only safe if all rows still satisfy it):
--   alter table portfolio_holdings add constraint portfolio_holdings_currency_check
--     check (currency = any (array['MYR','AUD','SGD','USD']));

alter table portfolio_holdings drop constraint if exists portfolio_holdings_currency_check;
