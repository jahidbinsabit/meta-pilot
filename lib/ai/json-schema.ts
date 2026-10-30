/**
 * Convert a Zod schema into a JSON Schema fragment.
 *
 * Used by both adapters to enforce structured output:
 *   - Gemini: `generationConfig.response_schema`
 *   - OpenAI: `response_format.json_schema.json_schema.schema`
 *
 * We only need to support the shapes our callers actually use (objects,
 * strings, numbers, booleans, arrays, enums, literals, optionals, defaults,
 * unions, intersections, records, tuples). Anything else degrades to `{}` so
 * the adapter still works — the Zod parse at the end is the real gate.
 */

import type { ZodType, ZodEffects, ZodOptional, ZodDefault, ZodNullable } from 'zod';

type JsonSchema = Record<string, unknown>;

export function zodToJsonSchema(schema: ZodType): JsonSchema {
  return walk(schema, new Set());
}

function walk(z: ZodType, seen: Set<ZodType>): JsonSchema {
  if (seen.has(z)) return {}; // break cycles (ZodLazy / recursive schemas)
  seen.add(z);

  const t = (z as any)?._def?.typeName as string | undefined;

  // Unwrap the "container" types that don't change the JSON shape.
  if (
    t === 'ZodOptional' ||
    t === 'ZodReadonly' ||
    t === 'ZodBranded' ||
    t === 'ZodCatch' ||
    t === 'ZodPrefault'
  ) {
    return walk((z as any).unwrap(), seen);
  }
  if (t === 'ZodDefault') {
    return walk((z as any)._def.innerType, seen);
  }
  if (t === 'ZodNullable') {
    const inner = walk((z as any).unwrap(), seen);
    return { ...inner, nullable: true };
  }
  if (t === 'ZodEffects' || t === 'ZodTransformer' || t === 'ZodLazy' || t === 'ZodPreparsed') {
    // ZodEffects wraps an inner schema (transform/refine/infer). Walk the inner.
    const inner = (z as ZodEffects<any, any>)._def.schema;
    return walk(inner, seen);
  }
  if (t === 'ZodPipeline') {
    // A pipeline's input side is what we validate; walk the input schema.
    return walk((z as any)._def.in, seen);
  }
  if (t === 'ZodIntersection') {
    return {
      allOf: [(z as any)._def.left, (z as any)._def.right].map((s: ZodType) => walk(s, seen)),
    };
  }
  if (t === 'ZodUnion') {
    return { anyOf: ((z as any)._def.options as ZodType[]).map((s) => walk(s, seen)) };
  }
  if (t === 'ZodDiscriminatedUnion') {
    return { anyOf: ((z as any)._def.options as ZodType[]).map((s) => walk(s, seen)) };
  }

  switch (t) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodBigInt':
      return { type: 'integer' };
    case 'ZodDate':
      return { type: 'string', format: 'date-time' };
    case 'ZodNull':
      return { type: 'null' };
    case 'ZodUndefined':
    case 'ZodVoid':
    case 'ZodNaN':
    case 'ZodSymbol':
      return {};
    case 'ZodLiteral': {
      const v = (z as any)._def.value;
      return literalSchema(v);
    }
    case 'ZodEnum':
      return { enum: [...((z as any)._def.values as unknown[])] };
    case 'ZodNativeEnum': {
      const obj = (z as any)._def.values as Record<string, unknown>;
      return { enum: Object.values(obj) };
    }
    case 'ZodArray': {
      const inner = (z as any)._def.type as ZodType;
      const s: JsonSchema = { type: 'array', items: walk(inner, seen) };
      if ((z as any)._def.exactLength) {
        s.minItems = (z as any)._def.exactLength.value;
        s.maxItems = (z as any)._def.exactLength.value;
      }
      return s;
    }
    case 'ZodTuple': {
      const items = ((z as any)._def.items as ZodType[]).map((s) => walk(s, seen));
      const s: JsonSchema = { type: 'array', items };
      const rest = (z as any)._def.rest;
      if (rest) s.additionalItems = walk(rest, seen);
      s.minItems = items.length;
      s.maxItems = items.length;
      return s;
    }
    case 'ZodObject':
      return objectSchema(z as any, seen);
    case 'ZodRecord': {
      const inner = (z as any)._def.valueType as ZodType;
      return { type: 'object', additionalProperties: walk(inner, seen) };
    }
    case 'ZodMap':
    case 'ZodSet':
    case 'ZodPromise':
    case 'ZodFunction':
    case 'ZodAny':
    case 'ZodUnknown':
    default:
      return {};
  }
}

function literalSchema(v: unknown): JsonSchema {
  if (v === null) return { type: 'null' };
  if (typeof v === 'string') return { type: 'string', const: v };
  if (typeof v === 'number') return { type: 'number', const: v };
  if (typeof v === 'boolean') return { type: 'boolean', const: v };
  return {};
}

function objectSchema(z: any, seen: Set<ZodType>): JsonSchema {
  const shape = z._def.shape();
  const properties: JsonSchema = {};
  const required: string[] = [];
  for (const [key, child] of Object.entries(shape) as [string, ZodType][]) {
    properties[key] = walk(child, seen);
    if (!isOptional(child)) required.push(key);
  }
  const s: JsonSchema = { type: 'object', properties };
  if (required.length) s.required = required;
  // Let the Zod parse handle extra/unknown keys — strict schemas still
  // validate fine because we strip unknown keys before parsing.
  return s;
}

function isOptional(z: ZodType): boolean {
  const t = (z as any)?._def?.typeName as string | undefined;
  return (
    t === 'ZodOptional' ||
    t === 'ZodDefault' ||
    t === 'ZodNullable' ||
    t === 'ZodReadonly' ||
    t === 'ZodBranded' ||
    t === 'ZodCatch' ||
    t === 'ZodPrefault'
  );
}
