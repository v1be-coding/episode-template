import Anthropic from "@anthropic-ai/sdk";
import { oidcFederationProvider } from "@anthropic-ai/sdk/lib/credentials/oidc-federation";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { GetWebIdentityTokenCommand, STSClient } from "@aws-sdk/client-sts";

// Claude without an API key (series ADR-0009). The Lambda asks AWS STS for a
// short-lived token that only Anthropic accepts, and the SDK trades it for a
// Claude token. Anthropic trusts the token because a federation rule, set up
// in Setup, names this episode's Lambda roles. See docs/calling-claude.md.

export const AUDIENCE = "https://api.anthropic.com";

// The episode's boundary refuses anything longer.
const STS_TOKEN_SECONDS = 300;

// The Lambda times out at 10 seconds. One attempt of at most 8 ends first, so
// the route can still answer. Raise both together if a route needs longer.
const DEFAULT_TIMEOUT_MS = 8_000;

// The four IDs Setup saves in SSM. None is a secret.
export type FederationIds = {
  organization_id: string;
  workspace_id: string;
  service_account_id: string;
  federation_rule_id: string;
};

const PATTERNS: Record<keyof FederationIds, RegExp> = {
  organization_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  workspace_id: /^wrkspc_[A-Za-z0-9]+$/,
  service_account_id: /^svac_[A-Za-z0-9]+$/,
  federation_rule_id: /^fdrl_[A-Za-z0-9]+$/,
};

export function parseFederationIds(json: string): FederationIds {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("The Anthropic federation parameter isn't JSON");
  }
  if (typeof value !== "object" || value === null) {
    throw new Error("The Anthropic federation parameter isn't an object");
  }
  const record = value as Record<string, unknown>;
  for (const [key, pattern] of Object.entries(PATTERNS)) {
    const field = record[key];
    if (typeof field !== "string" || !pattern.test(field)) {
      throw new Error(`The Anthropic federation parameter has no valid ${key}`);
    }
  }
  return record as FederationIds;
}

export function federationParameterName(episode: string): string {
  return `/${episode}/third-party/anthropic-federation`;
}

export type ClaudeDeps = {
  ssm?: Pick<SSMClient, "send">;
  sts?: Pick<STSClient, "send">;
  episode?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

async function loadIds(ssm: Pick<SSMClient, "send">, episode: string): Promise<FederationIds> {
  const out = await ssm.send(new GetParameterCommand({ Name: federationParameterName(episode) }));
  const json = out.Parameter?.Value;
  if (!json) throw new Error("The Anthropic federation parameter is empty");
  return parseFederationIds(json);
}

export async function createClaude(deps: ClaudeDeps = {}): Promise<Anthropic> {
  const episode = deps.episode ?? process.env.EPISODE ?? "";
  if (!episode) throw new Error("EPISODE isn't set");
  const ssm = deps.ssm ?? new SSMClient({});
  const sts = deps.sts ?? new STSClient({});
  const ids = await loadIds(ssm, episode);

  const identityTokenProvider = async (): Promise<string> => {
    const out = await sts.send(
      new GetWebIdentityTokenCommand({
        Audience: [AUDIENCE],
        SigningAlgorithm: "RS256",
        DurationSeconds: STS_TOKEN_SECONDS,
      }),
    );
    if (!out.WebIdentityToken) throw new Error("STS returned no web identity token");
    return out.WebIdentityToken;
  };

  // The client caches the Claude token and refreshes it before it expires, so
  // reusing one client per container means one exchange every few minutes.
  return new Anthropic({
    credentials: oidcFederationProvider({
      identityTokenProvider,
      federationRuleId: ids.federation_rule_id,
      organizationId: ids.organization_id,
      serviceAccountId: ids.service_account_id,
      workspaceId: ids.workspace_id,
      baseURL: AUDIENCE,
      fetch: deps.fetch ?? fetch,
    }),
    timeout: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: 0,
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  });
}

let shared: Promise<Anthropic> | undefined;

/**
 * One client per Lambda container. A failed setup isn't kept, so the next
 * request tries again. Unused in the template; an episode's AI routes call it.
 * @public
 */
export function claude(): Promise<Anthropic> {
  shared ??= createClaude().catch((error: unknown) => {
    shared = undefined;
    throw error;
  });
  return shared;
}

export type ClaudeFailure =
  | "spend_limit" // the workspace's monthly limit or the tier's cap: retrying won't help
  | "rate_limit" // the workspace's requests per minute
  | "overloaded" // Anthropic is busy for everyone, so a later retry may work
  | "auth" // the federation rule or the Lambda's role
  | "timeout"
  | "other";

// Sorts a failed call, including errors that arrive mid-stream, where the SDK
// gives no HTTP status and only the error's type says what happened.
export function classifyClaudeError(error: unknown): ClaudeFailure {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (!(error instanceof Anthropic.APIError)) return "other";
  const body = error.error as
    { error?: { type?: string; message?: string; details?: { error_code?: string } } } | undefined;
  const type = error.type ?? body?.error?.type;
  const message = body?.error?.message ?? error.message;
  if (body?.error?.details?.error_code === "enforced_spend_limit_reached") return "spend_limit";
  if (error.status === 400 && /usage limits/i.test(message)) return "spend_limit";
  if (type === "overloaded_error" || error.status === 529) return "overloaded";
  if (type === "rate_limit_error" || error.status === 429) return "rate_limit";
  if (type === "authentication_error" || type === "permission_error") return "auth";
  if (error.status === 401 || error.status === 403) return "auth";
  return "other";
}
