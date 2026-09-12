/**
 * Domain layer barrel.
 *
 * Nothing under `src/domain` imports Prisma or any generated persistence
 * type. Application and UI code should depend on these definitions; the
 * repositories in `src/server/repositories` are the only place where domain
 * and persistence meet.
 */
export * from "./shared/enums";
export * from "./shared/identifier";
export * from "./artifacts";
export * from "./assumption-monitoring";
export * from "./auth";
export * from "./certification";
export * from "./change-request";
export * from "./command-center";
export * from "./decision-memory";
export * from "./design-item";
export * from "./drift";
export * from "./engineering-decision";
export * from "./evidence";
export * from "./graph";
export * from "./impact-analysis";
export * from "./issue";
export * from "./links";
export * from "./project";
export * from "./requirement";
export * from "./risk";
export * from "./sentinel";
export * from "./stakeholder-need";
export * from "./supplier";
export * from "./technical-readiness";
export * from "./traceability";
export * from "./verification-activity";
export * from "./verification-readiness";
