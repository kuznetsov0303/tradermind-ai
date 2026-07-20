import crypto from "crypto";

export type FondyCheckoutPayload = Record<
  string,
  string | number | boolean | null | undefined
>;

export function getRequiredFondyEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required Fondy environment variable: ${name}`);
  }

  return value;
}

export function createFondySignature(
  payload: FondyCheckoutPayload,
  password: string,
): string {
  const values = Object.entries(payload)
    .filter(([key, value]) => {
      if (key === "signature") return false;
      if (value === undefined || value === null || value === "") return false;
      return true;
    })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => String(value));

  const signatureString = [password, ...values].join("|");

  return crypto.createHash("sha1").update(signatureString).digest("hex");
}

export function verifyFondySignature(
  payload: FondyCheckoutPayload,
  password: string,
): boolean {
  const receivedSignature = String(payload.signature || "");

  if (!receivedSignature) return false;

  const expectedSignature = createFondySignature(payload, password);

  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedSignature),
      Buffer.from(expectedSignature),
    );
  } catch {
    return false;
  }
}

export function toFondyMinorUnits(amountUsd: number): number {
  return Math.round(amountUsd * 100);
}

export function getFondyApiBaseUrl(): string {
  return process.env.FONDY_API_BASE_URL || "https://pay.fondy.eu/api";
}