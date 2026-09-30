import { v4 as uuidv4 } from 'uuid';

/** Prisma models in this project do not use @default(cuid()) — callers must supply ids. */
export function createId() {
  return uuidv4();
}
