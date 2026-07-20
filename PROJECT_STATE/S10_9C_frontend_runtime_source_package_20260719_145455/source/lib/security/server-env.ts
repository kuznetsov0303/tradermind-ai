/**
 * SkillEdge AI server-only environment helpers.
 *
 * Rule for production SaaS:
 * - Public browser variables are allowed only for harmless client config
 *   such as NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * - Provider keys, AI keys, cron secrets, service-role keys and paid data keys
 *   must never use NEXT_PUBLIC_* names and must never be read on the client.
 */

export type ServerEnvStatus = {
  name: string;
  configured: boolean;
  publicName: boolean;
};

function normalizeEnvValue(value: string | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPublicEnvName(name: string) {
  return String(name || "").startsWith("NEXT_PUBLIC_");
}

function assertServerOnlyEnvName(name: string, context?: string) {
  if (!isPublicEnvName(name)) return;

  const label = context ? ` for ${context}` : "";

  throw new Error(
    `Security violation${label}: ${name} is a NEXT_PUBLIC_* variable. ` +
      "Provider keys, cron secrets, service-role keys and paid market data keys must be server-only. " +
      "Move the value to a non-public environment variable."
  );
}

export function getOptionalServerEnv(name: string, context?: string) {
  assertServerOnlyEnvName(name, context);
  return normalizeEnvValue(process.env[name]);
}

export function getRequiredServerEnv(name: string, context?: string) {
  const value = getOptionalServerEnv(name, context);

  if (!value) {
    const label = context ? ` for ${context}` : "";
    throw new Error(`Missing server environment variable ${name}${label}.`);
  }

  return value;
}

export function getOptionalServerEnvFrom(names: string[], context?: string) {
  for (const name of names) {
    const value = getOptionalServerEnv(name, context);
    if (value) return value;
  }

  return null;
}

export function getRequiredServerEnvFrom(names: string[], context?: string) {
  const value = getOptionalServerEnvFrom(names, context);

  if (!value) {
    const label = context ? ` for ${context}` : "";
    throw new Error(`Missing server environment variable${label}: ${names.join(" or ")}.`);
  }

  return value;
}

export function getServerEnvStatus(names: string[]): ServerEnvStatus[] {
  return names.map((name) => ({
    name,
    configured: Boolean(normalizeEnvValue(process.env[name])),
    publicName: isPublicEnvName(name),
  }));
}
