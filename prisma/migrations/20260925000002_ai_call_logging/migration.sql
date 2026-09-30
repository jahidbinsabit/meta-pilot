-- AI call logging (PROMPT 12 / PROMPT 9.1 / PROMPT 9.6).
--
-- Records every `generateWithAI` invocation so the admin panel can measure
-- per-provider latency, token usage, and error rate (the "test provider"
-- and error-rate KPIs). Written fire-and-forget by the AI router; failures
-- there must never abort a generation call.

CREATE TABLE "AiCallLog" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "toolSlug"      TEXT NOT NULL,
  "provider"      TEXT NOT NULL,
  "model"         TEXT NOT NULL,
  "latencyMs"     INTEGER NOT NULL,
  "promptTokens"  INTEGER,
  "completionTokens" INTEGER,
  "totalTokens"   INTEGER,
  "success"       BOOLEAN NOT NULL,
  "errorMessage"  TEXT,
  "responseSchema" TEXT,
  "parsedOk"      BOOLEAN NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE INDEX "AiCallLog_provider_idx" ON "AiCallLog" ("provider");
CREATE INDEX "AiCallLog_toolSlug_idx" ON "AiCallLog" ("toolSlug");
CREATE INDEX "AiCallLog_createdAt_idx" ON "AiCallLog" ("createdAt");
CREATE INDEX "AiCallLog_success_idx" ON "AiCallLog" ("success");