import {
  evaluateTerminalBridgeCanaryReadiness,
  type TerminalCanaryReadiness,
} from "./canary-readiness.ts";
import {
  buildTerminalBridgeObservabilityCatalog,
  type TerminalBridgeObservabilityCatalog,
} from "./observability.ts";
import {
  buildTerminalBridgeRolloutPlan,
  type TerminalBridgeRolloutPlan,
} from "./rollout.ts";
import {
  buildTerminalBridgeSourcePolicyCatalog,
  type TerminalSourcePolicyCatalog,
} from "./source-policy.ts";

export type TerminalCanaryHandoffBlocker = {
  id: string;
  label: string;
  missingInputs: string[];
  note: string;
};

export type TerminalCanaryAccessPrerequisite = {
  id: string;
  label: string;
  requiredAccess: string[];
  note: string;
};

export type TerminalBridgeCanaryHandoff = {
  readOnly: true;
  readyForProductionCanary: boolean;
  readyForGeneralRollout: boolean;
  accessPrerequisites: TerminalCanaryAccessPrerequisite[];
  blockerSummary: TerminalCanaryHandoffBlocker[];
  nextAction: string;
  canaryReadiness: TerminalCanaryReadiness;
  rollout: TerminalBridgeRolloutPlan;
  observability: TerminalBridgeObservabilityCatalog;
  sourcePolicy: TerminalSourcePolicyCatalog;
};

export type TerminalBridgeCanaryEnvTemplate = {
  readOnly: true;
  readyForProductionCanary: boolean;
  readyForGeneralRollout: boolean;
  accessPrerequisites: TerminalCanaryAccessPrerequisite[];
  missingInputs: string[];
  generalRolloutMissingInputs: string[];
  template: string;
  generalRolloutTemplate: string;
};

type Env = Record<string, string | undefined>;

const BOOLEAN_CANARY_INPUTS = new Set([
  "SOLVOL_POSTGRES_BACKUP_VERIFIED",
  "SOLVOL_SOURCE_POLICY_REVIEWED",
  "SOLVOL_SECRET_ROTATION_VERIFIED",
  "SOLVOL_STAGING_SHADOW_SOAK_PASSED",
  "SOLVOL_REPLAY_DETERMINISM_VERIFIED",
  "SOLVOL_ANALYST_QA_APPROVED",
  "SOLVOL_CANARY_WINDOW_PASSED",
  "SOLVOL_NO_P1_P2_DEFECTS",
]);

export const TERMINAL_BRIDGE_CANARY_ACCESS_PREREQUISITES: TerminalCanaryAccessPrerequisite[] = [
  {
    id: "vercel_project_settings",
    label: "Vercel team/project settings access",
    requiredAccess: [
      "Access to the Vercel team that owns the linked solvol project.",
      "Permission to edit Production and staging Preview environment variables.",
      "Permission to identify the deployment target and rollback surface.",
    ],
    note: "Canary values cannot be verified or configured until the operator can read and edit the target Vercel project.",
  },
  {
    id: "supabase_project_admin",
    label: "Supabase project admin access",
    requiredAccess: [
      "Project URL and browser publishable key for auth setup.",
      "Server-only service role key for backend Data API and Storage writes.",
      "SQL editor or migration permission plus private Storage bucket controls.",
      "Backup and restore verification evidence.",
    ],
    note: "Raw replay storage, cursors, bridge rows, outbox state, and source health require Supabase project access before production canary.",
  },
  {
    id: "observability_alert_routing",
    label: "Observability and alert routing ownership",
    requiredAccess: [
      "Metrics backend destination for source lag, replay, DLQ, and fanout dashboards.",
      "Error monitoring destination.",
      "Alert routing endpoint for source, replay, DLQ, and fanout incidents.",
    ],
    note: "Production canary must not start until metrics, errors, and alert routing are accountable and configured.",
  },
  {
    id: "canary_ownership_approval",
    label: "Canary ownership, secret rotation, and rollback approval",
    requiredAccess: [
      "Named canary owner.",
      "Named canary reviewer.",
      "Named rollback approver.",
      "Completed source policy review.",
      "Completed secret exposure rotation review.",
    ],
    note: "Human ownership and rollback authority remain required even when all technical environment values are present.",
  },
];

function uniqueById(blockers: TerminalCanaryHandoffBlocker[]): TerminalCanaryHandoffBlocker[] {
  const seen = new Set<string>();
  const out: TerminalCanaryHandoffBlocker[] = [];
  for (const blocker of blockers) {
    if (seen.has(blocker.id)) continue;
    seen.add(blocker.id);
    out.push(blocker);
  }
  return out;
}

function uniqueInputs(inputs: string[]): string[] {
  return Array.from(new Set(inputs.flatMap((input) => input.split(/\s+or\s+/))));
}

function templateLine(input: string): string {
  return `${input}=${BOOLEAN_CANARY_INPUTS.has(input) ? "false" : ""}`;
}

function generalRolloutMissingInputs(rollout: TerminalBridgeRolloutPlan): string[] {
  const generalRollout = rollout.phases.find((phase) => phase.id === "general_rollout");
  return uniqueInputs(generalRollout?.missingInputs ?? []);
}

export function buildTerminalBridgeCanaryHandoff(
  env: Env = process.env,
): TerminalBridgeCanaryHandoff {
  const canaryReadiness = evaluateTerminalBridgeCanaryReadiness(env);
  const rollout = buildTerminalBridgeRolloutPlan(env);
  const observability = buildTerminalBridgeObservabilityCatalog(env);
  const sourcePolicy = buildTerminalBridgeSourcePolicyCatalog(env);
  const blockerSummary = uniqueById([
    ...canaryReadiness.checks
      .filter((check) => check.missingInputs.length > 0)
      .map((check): TerminalCanaryHandoffBlocker => ({
        id: `canary:${check.id}`,
        label: check.label,
        missingInputs: check.missingInputs,
        note: check.note,
      })),
    ...rollout.phases
      .filter((phase) => phase.id !== "general_rollout")
      .filter((phase) => phase.status === "blocked")
      .flatMap((phase) => phase.gates
        .filter((gate) => gate.missingInputs.length > 0)
        .map((gate): TerminalCanaryHandoffBlocker => ({
          id: `rollout:${phase.id}:${gate.id}`,
          label: `${phase.label}: ${gate.label}`,
          missingInputs: gate.missingInputs,
          note: gate.note,
        }))),
    ...(!observability.ready ? [{
      id: "observability:catalog",
      label: "Observability catalog readiness",
      missingInputs: observability.missingInputs,
      note: "Metrics and alert routing are required before canary promotion.",
    }] : []),
    ...(!sourcePolicy.reviewComplete ? [{
      id: "source_policy:review",
      label: "Source policy review",
      missingInputs: sourcePolicy.missingInputs,
      note: "Human source policy review remains required before live polling leaves local/demo mode.",
    }] : []),
  ]);
  const readyForProductionCanary = canaryReadiness.ready && rollout.readyForProductionCanary;

  return {
    readOnly: true,
    readyForProductionCanary,
    readyForGeneralRollout: rollout.readyForGeneralRollout,
    accessPrerequisites: TERMINAL_BRIDGE_CANARY_ACCESS_PREREQUISITES,
    blockerSummary,
    nextAction: readyForProductionCanary
      ? "Production canary may start behind bridge feature flags after operator confirmation."
      : "Configure the missing infrastructure, policy, owner, and rollback inputs listed in blockerSummary.",
    canaryReadiness,
    rollout,
    observability,
    sourcePolicy,
  };
}

export function buildTerminalBridgeCanaryEnvTemplate(
  env: Env = process.env,
): TerminalBridgeCanaryEnvTemplate {
  const handoff = buildTerminalBridgeCanaryHandoff(env);
  const missingInputs = uniqueInputs(handoff.blockerSummary.flatMap((blocker) => blocker.missingInputs));
  const generalMissingInputs = generalRolloutMissingInputs(handoff.rollout);

  return {
    readOnly: true,
    readyForProductionCanary: handoff.readyForProductionCanary,
    readyForGeneralRollout: handoff.readyForGeneralRollout,
    accessPrerequisites: handoff.accessPrerequisites,
    missingInputs,
    generalRolloutMissingInputs: generalMissingInputs,
    template: missingInputs.map(templateLine).join("\n"),
    generalRolloutTemplate: generalMissingInputs.map(templateLine).join("\n"),
  };
}
