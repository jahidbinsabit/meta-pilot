/** Prisma models in this project do not use @default(cuid()) — callers must supply ids. */
export function createId() {
  return crypto.randomUUID();
}
