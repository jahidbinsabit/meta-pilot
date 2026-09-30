-- Add admin-configurable Prompt Style presets for the Image → Prompt tool
-- (PROMPT 5). Each row maps a user-facing label to the system instruction
-- sent to the AI provider when that style is selected.

CREATE TABLE "PromptStylePreset" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "systemInstruction" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptStylePreset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromptStylePreset_slug_key" ON "PromptStylePreset"("slug");

CREATE INDEX "PromptStylePreset_isActive_idx" ON "PromptStylePreset"("isActive");

CREATE INDEX "PromptStylePreset_sortOrder_idx" ON "PromptStylePreset"("sortOrder");
