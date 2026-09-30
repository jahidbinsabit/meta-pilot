-- Add admin-configurable slider bounds + default prefix/suffix to the
-- generator settings snapshot (PROMPT 4.2 / PROMPT 9.7).

ALTER TABLE "GeneratorSettings"
ADD COLUMN "titleMin" INTEGER NOT NULL DEFAULT 20;

ALTER TABLE "GeneratorSettings"
ADD COLUMN "titleMax" INTEGER NOT NULL DEFAULT 120;

ALTER TABLE "GeneratorSettings"
ADD COLUMN "keywordsMin" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "GeneratorSettings"
ADD COLUMN "keywordsMax" INTEGER NOT NULL DEFAULT 49;

ALTER TABLE "GeneratorSettings"
ADD COLUMN "defaultPrefix" TEXT;

ALTER TABLE "GeneratorSettings"
ADD COLUMN "defaultSuffix" TEXT;