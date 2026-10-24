import { z } from 'zod';

import { artifactRefSchema } from './refs.ts';
import { validateVersioned, type ValidationResult } from './validate.ts';

export const SPEC_PROPOSAL_VERSION = 'lyo.spec-proposal.v1';

export const specProposalStatusSchema = z.enum(['pending', 'accepted', 'rejected']);

export const specProposalSchema = z.object({
  version: z.literal(SPEC_PROPOSAL_VERSION),
  proposalId: z.string().min(1),
  specRef: artifactRefSchema,
  specId: z.string().min(1),
  // The suggested contract change — a sentence or section a human can apply.
  edit: z.string().min(1),
  rationale: z.string().min(1),
  evidence: z.string().min(1),
  sourceRuns: z.array(z.string().min(1)).min(1),
  status: specProposalStatusSchema,
  createdAt: z.string().min(1),
});

export type SpecProposal = z.infer<typeof specProposalSchema>;
export type SpecProposalStatus = z.infer<typeof specProposalStatusSchema>;

export function validateSpecProposal(value: unknown): ValidationResult<SpecProposal> {
  return validateVersioned(specProposalSchema, SPEC_PROPOSAL_VERSION, value);
}
