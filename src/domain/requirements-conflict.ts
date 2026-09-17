import { z } from "zod";

export interface RequirementsConflictRecord {
  id: string;
  projectId: string;
  requirementId: string;
  requirementIdentifier: string;
  requirementTitle: string;
  stakeholdersInvolved: string[];
  positions: Array<{
    stakeholderName: string;
    position: "AGREE" | "DISAGREE" | "CHANGES_REQUESTED";
    interpretation: string;
    supportingEvidence?: string;
  }>;
  differenceInInterpretation: string;
  potentialEngineeringImpact: string;
  requiredInformationToResolve: string;
  currentDecisionStatus: "OPEN_DISAGREEMENT" | "UNDER_MEDIATION" | "RESOLVED";
  createdAt: Date;
  updatedAt: Date;
}

export const createRequirementsConflictSchema = z.object({
  projectId: z.string(),
  requirementId: z.string(),
  requirementIdentifier: z.string(),
  requirementTitle: z.string(),
  stakeholdersInvolved: z.array(z.string()).min(2),
  positions: z.array(
    z.object({
      stakeholderName: z.string(),
      position: z.enum(["AGREE", "DISAGREE", "CHANGES_REQUESTED"]),
      interpretation: z.string(),
      supportingEvidence: z.string().optional(),
    })
  ).min(2),
  differenceInInterpretation: z.string(),
  potentialEngineeringImpact: z.string(),
  requiredInformationToResolve: z.string(),
});

export type CreateRequirementsConflictInput = z.infer<typeof createRequirementsConflictSchema>;
