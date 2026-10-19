'use client';

import { useCredits } from '@/components/dashboard/credits-provider';
import type { UploadedFile } from '@/lib/generator/types';
import type { ToolEntry } from '@/lib/tools/registry';

export interface ToolGating {
  /** Files ready to process (uploaded + analyzed). */
  readyFiles: UploadedFile[];
  /** Total credit cost for the ready files. */
  totalCost: number;
  /** Whether the Process button should be enabled. */
  canProcess: boolean;
  /** Current credit balance (for the insufficient-credits warning). */
  credits: number;
  /** Whether unlimited generation mode is on (for the warning). */
  unlimited: boolean;
}

/**
 * Shared credit-gating logic for the creative micro-tool clients.
 *
 * Computes which files are ready, the total cost, and whether processing is
 * allowed — honoring free tools, unlimited mode, and the credit balance.
 * `credits`/`unlimited` are also returned so the insufficient-credits
 * warning can be rendered consistently.
 */
export function useToolGating(files: UploadedFile[], tool: ToolEntry): ToolGating {
  const { credits, unlimited } = useCredits();

  const readyFiles = files.filter((f) => f.status === 'done' && (f.previewUrl || f.dataUrl));
  const totalCost = readyFiles.length * tool.creditCost;
  const canProcess =
    readyFiles.length > 0 &&
    !files.some((f) => f.status === 'analyzing') &&
    (tool.isFree || unlimited || credits >= totalCost);

  return { readyFiles, totalCost, canProcess, credits, unlimited };
}
