import { bridgeSourceFlagName, envNameForBridgeFlag } from "./bridge-control.ts";

export type TerminalCanaryCheckStatus = "pass" | "fail";

export type TerminalCanaryReadinessCheck = {
  id: string;
  label: string;
  status: TerminalCanaryCheckStatus;
  requiredInputs: string[];
  missingInputs: string[];
  note: string;
};

export type TerminalCanaryReadiness = {
  readOnly: true;
  ready: boolean;
  missingInputs: string[];
  checks: TerminalCanaryReadinessCheck[];
};

type Env = Record<string, string | undefined>;

function present(env: Env, name: string): boolean {
  return Boolean(env[name]?.trim());
}

function truthy(env: Env, name: string): boolean {
  return /^(1|true|yes|on)$/i.test(env[name]?.trim() ?? "");
}

function sourceFlagEnabled(env: Env, sourceId: string): boolean {
  return truthy(env, envNameForBridgeFlag(bridgeSourceFlagName(sourceId)));
}

function check(
  env: Env,
  id: string,
  label: string,
  requiredInputs: string[],
  note: string,
): TerminalCanaryReadinessCheck {
  const missingInputs = requiredInputs.filter((name) => !present(env, name));
  return {
    id,
    label,
    status: missingInputs.length === 0 ? "pass" : "fail",
    requiredInputs,
    missingInputs,
    note,
  };
}

function eitherCheck(
  env: Env,
  id: string,
  label: string,
  alternatives: string[],
  note: string,
): TerminalCanaryReadinessCheck {
  const missingInputs = alternatives.some((name) => present(env, name))
    ? []
    : [alternatives.join(" or ")];
  return {
    id,
    label,
    status: missingInputs.length === 0 ? "pass" : "fail",
    requiredInputs: alternatives,
    missingInputs,
    note,
  };
}

function approvalCheck(
  env: Env,
  id: string,
  label: string,
  requiredInput: string,
  note: string,
): TerminalCanaryReadinessCheck {
  const missingInputs = truthy(env, requiredInput) ? [] : [requiredInput];
  return {
    id,
    label,
    status: missingInputs.length === 0 ? "pass" : "fail",
    requiredInputs: [requiredInput],
    missingInputs,
    note,
  };
}

function ethereumChecks(env: Env): TerminalCanaryReadinessCheck[] {
  if (!sourceFlagEnabled(env, "ethereum-json-rpc")) return [];
  return [
    check(
      env,
      "ethereum_rpc_endpoint",
      "Ethereum JSON-RPC endpoint",
      ["SOLVOL_TERMINAL_ETHEREUM_RPC_URL"],
      "Required only when Ethereum JSON-RPC ingestion is enabled.",
    ),
    eitherCheck(
      env,
      "ethereum_rpc_filter",
      "Ethereum JSON-RPC read filter",
      ["SOLVOL_TERMINAL_ETHEREUM_CONTRACTS", "SOLVOL_TERMINAL_ETHEREUM_TOPICS"],
      "At least one contract or topic filter is required to avoid unbounded log reads.",
    ),
  ];
}

function sourceConfigChecks(env: Env): TerminalCanaryReadinessCheck[] {
  const checks: TerminalCanaryReadinessCheck[] = [];
  const addRequired = (
    sourceId: string,
    label: string,
    requiredInputs: string[],
    note: string,
  ) => {
    if (sourceFlagEnabled(env, sourceId)) checks.push(check(env, `${sourceId}_config`, label, requiredInputs, note));
  };
  const addTruthy = (
    sourceId: string,
    label: string,
    requiredInput: string,
    note: string,
  ) => {
    if (sourceFlagEnabled(env, sourceId)) checks.push(approvalCheck(env, `${sourceId}_enabled`, label, requiredInput, note));
  };
  const addEither = (
    sourceId: string,
    label: string,
    alternatives: string[],
    note: string,
  ) => {
    if (sourceFlagEnabled(env, sourceId)) checks.push(eitherCheck(env, `${sourceId}_filter`, label, alternatives, note));
  };

  addTruthy("gdelt-doc", "GDELT DOC live polling enabled", "SOLVOL_TERMINAL_GDELT_ENABLED", "Required when the GDELT source flag is enabled.");
  addRequired("sec-rss", "SEC RSS feed config", ["SOLVOL_TERMINAL_SEC_RSS_URL", "SOLVOL_TERMINAL_SEC_USER_AGENT"], "Required when SEC RSS ingestion is enabled.");
  addRequired("federal-reserve-rss", "Federal Reserve RSS feed config", ["SOLVOL_TERMINAL_FED_RSS_URL"], "Required when Federal Reserve RSS ingestion is enabled.");
  addRequired("usgs-earthquakes", "USGS GeoJSON feed config", ["SOLVOL_TERMINAL_USGS_URL"], "Required when USGS earthquake ingestion is enabled.");
  addRequired("cisa-rss", "CISA RSS feed config", ["SOLVOL_TERMINAL_CISA_RSS_URL"], "Required when CISA RSS ingestion is enabled.");
  addRequired("etherscan-indexed", "Etherscan indexed log config", ["SOLVOL_TERMINAL_ETHERSCAN_API_KEY"], "Required when Etherscan indexed enrichment is enabled.");
  addEither("etherscan-indexed", "Etherscan indexed log read filter", ["SOLVOL_TERMINAL_ETHERSCAN_CONTRACTS", "SOLVOL_TERMINAL_ETHERSCAN_TOPICS"], "At least one contract or topic filter is required to avoid broad indexed reads.");
  addTruthy("coingecko-context", "CoinGecko market context enabled", "SOLVOL_TERMINAL_COINGECKO_ENABLED", "Required when CoinGecko context ingestion is enabled.");
  addRequired("fema-ipaws-rss", "FEMA IPAWS feed config", ["SOLVOL_TERMINAL_FEMA_IPAWS_URL"], "Required when FEMA IPAWS ingestion is enabled.");
  addRequired("gnews-api", "GNews API config", ["SOLVOL_TERMINAL_GNEWS_API_KEY", "SOLVOL_TERMINAL_GNEWS_TERMS"], "Required when GNews commercial news recall is enabled.");
  addRequired("mediastack-api", "mediastack API config", ["SOLVOL_TERMINAL_MEDIASTACK_API_KEY", "SOLVOL_TERMINAL_MEDIASTACK_TERMS"], "Required when mediastack commercial news recall is enabled.");
  addRequired("fact-check-overlays", "Fact-check RSS overlay config", ["SOLVOL_TERMINAL_FACT_CHECK_RSS_URL"], "Required when fact-check overlays are enabled.");

  if (sourceFlagEnabled(env, "reddit-oauth")) {
    checks.push(approvalCheck(
      env,
      "reddit-oauth_social_policy",
      "Reddit low-trust social source gate",
      "SOLVOL_FLAG_BRIDGE_SOCIAL_LOW_TRUST_SOURCES",
      "Required before low-trust social source polling is enabled.",
    ));
    checks.push(check(
      env,
      "reddit-oauth_config",
      "Reddit OAuth search config",
      ["SOLVOL_TERMINAL_REDDIT_ACCESS_TOKEN", "SOLVOL_TERMINAL_REDDIT_TERMS"],
      "Required when Reddit OAuth ingestion is enabled.",
    ));
  }
  if (sourceFlagEnabled(env, "mastodon-public")) {
    checks.push(approvalCheck(
      env,
      "mastodon-public_social_policy",
      "Mastodon low-trust social source gate",
      "SOLVOL_FLAG_BRIDGE_SOCIAL_LOW_TRUST_SOURCES",
      "Required before low-trust social source polling is enabled.",
    ));
    checks.push(check(
      env,
      "mastodon-public_config",
      "Mastodon public search config",
      ["SOLVOL_TERMINAL_MASTODON_INSTANCE_URL", "SOLVOL_TERMINAL_MASTODON_TERMS"],
      "Required when Mastodon public search is enabled.",
    ));
  }

  return checks;
}

export function evaluateTerminalBridgeCanaryReadiness(
  env: Env = process.env,
): TerminalCanaryReadiness {
  const checks: TerminalCanaryReadinessCheck[] = [
    check(
      env,
      "database",
      "Postgres/Supabase system of record",
      ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      "Needed for source cursors, bridge rows, outbox state, and API-backed source health.",
    ),
    check(
      env,
      "raw_object_storage",
      "Raw payload object storage",
      ["SOLVOL_RAW_STORAGE_BUCKET"],
      "Needed for immutable raw source payload envelopes and replay.",
    ),
    eitherCheck(
      env,
      "fanout",
      "Realtime fanout backend",
      ["SOLVOL_BRIDGE_BROADCASTER_URL", "SOLVOL_BRIDGE_REDIS_URL"],
      "Needed before production canary for outbox delivery beyond local SSE fallback.",
    ),
    check(
      env,
      "observability",
      "Error and metrics observability",
      ["SOLVOL_ERROR_MONITORING_DSN", "SOLVOL_METRICS_DSN"],
      "Needed for source failure, replay, DLQ, and fanout alerts.",
    ),
    check(
      env,
      "alert_routing",
      "Alert routing",
      ["SOLVOL_ALERT_ROUTING_URL"],
      "Needed for source failure, rate-limit, replay nondeterminism, DLQ growth, and fanout lag alerts.",
    ),
    check(
      env,
      "deployment_access",
      "Deployment target access",
      ["SOLVOL_DEPLOY_TARGET"],
      "Needed to identify the staging/canary deploy target and rollback surface.",
    ),
    approvalCheck(
      env,
      "backups_verified",
      "Postgres backups verified",
      "SOLVOL_POSTGRES_BACKUP_VERIFIED",
      "Must be true before running staging active or production canary.",
    ),
    approvalCheck(
      env,
      "source_policy_review",
      "Source policy review complete",
      "SOLVOL_SOURCE_POLICY_REVIEWED",
      "Must be true before live source polling leaves local/demo mode.",
    ),
    check(
      env,
      "canary_ownership",
      "Canary ownership, review, and rollback approval",
      ["SOLVOL_CANARY_OWNER", "SOLVOL_CANARY_REVIEWER", "SOLVOL_ROLLBACK_APPROVER"],
      "Needed so production canary has an accountable owner, reviewer, and rollback approver.",
    ),
    ...ethereumChecks(env),
    ...sourceConfigChecks(env),
  ];
  const missingInputs = [...new Set(checks.flatMap((item) => item.missingInputs))];

  return {
    readOnly: true,
    ready: missingInputs.length === 0,
    missingInputs,
    checks,
  };
}
