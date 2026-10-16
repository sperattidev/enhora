-- Base city. Zones are loaded later from the admin panel.
INSERT INTO "cities" ("slug", "name", "province", "active")
VALUES ('firmat', 'Firmat', 'Santa Fe', true)
ON CONFLICT ("slug") DO NOTHING;
