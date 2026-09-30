/**
 * Typed credit errors.
 *
 * These are the only error classes the credit module throws. Route handlers
 * catch them and map to a 402 / upgrade-CTA response; anything else is a
 * programming error and should surface as a 500.
 */

/** Thrown when a plan tier is required for a feature the user does not have. */
export class PlanRequiredError extends Error {
  readonly _tag = 'plan_required';
  constructor(
    message: string,
    public readonly required: string,
    public readonly current: string,
  ) {
    super(message);
    this.name = 'PlanRequiredError';
  }
}

/** Thrown when a spend would exceed the user's balance. */
export class InsufficientCreditsError extends Error {
  readonly _tag = 'insufficient_credits';
  constructor(
    message: string,
    public readonly balance: number,
    public readonly needed: number,
  ) {
    super(message);
    this.name = 'InsufficientCreditsError';
  }
}

export function isInsufficientCreditsError(e: unknown): e is InsufficientCreditsError {
  return e instanceof InsufficientCreditsError;
}

export function isPlanRequiredError(e: unknown): e is PlanRequiredError {
  return e instanceof PlanRequiredError;
}
