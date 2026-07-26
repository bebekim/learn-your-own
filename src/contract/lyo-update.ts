import { z } from 'zod';

import { artifactRefSchema } from './refs.ts';
import { validateVersioned, type ValidationResult } from './validate.ts';

// Experimental: the shape may change freely until a real LYO consumer exists.
export const LYO_UPDATE_VERSION = 'lyo.lyo-update.v0';

export const lyoUpdatePromotionSchema = z.object({
  artifactRef: artifactRefSchema,
  scope: z.string().min(1),
  rationale: z.string().min(1),
});

export const lyoUpdateBeliefSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  rationale: z.string().min(1),
});

export const lyoUpdateSchema = z.object({
  version: z.literal(LYO_UPDATE_VERSION),
  basedOnTraces: z.array(artifactRefSchema).min(1),
  promotions: z.array(lyoUpdatePromotionSchema),
  beliefUpdates: z.array(lyoUpdateBeliefSchema).optional(),
});

export type LyoUpdate = z.infer<typeof lyoUpdateSchema>;
export type LyoUpdatePromotion = z.infer<typeof lyoUpdatePromotionSchema>;
export type LyoUpdateBelief = z.infer<typeof lyoUpdateBeliefSchema>;

export function validateLyoUpdate(value: unknown): ValidationResult<LyoUpdate> {
  return validateVersioned(lyoUpdateSchema, LYO_UPDATE_VERSION, value);
}
