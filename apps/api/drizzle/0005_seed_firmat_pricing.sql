-- Starting values for Firmat, in cents. The admin adjusts them from the panel.
INSERT INTO "pricing_rules" (
  "city_id", "extra_stop_fee_cents", "errand_fee_cents", "surcharge_bps",
  "round_to_cents", "free_wait_minutes", "wait_fee_per_minute_cents"
)
SELECT "id", 150000, 200000, 0, 5000, 5, 10000 FROM "cities" WHERE "slug" = 'firmat'
ON CONFLICT ("city_id") DO NOTHING;
