import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/security/server-auth";

export type AdminAccessResult =
  | {
      ok: true;
      adminEmail: string;
      userId: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export function getAdminEmails(): string[] {
  const raw =
    process.env.SUPPORT_ADMIN_EMAILS ||
    process.env.SUPPORT_ADMIN_EMAIL ||
    process.env.ADMIN_EMAIL ||
    "";

  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdminAccess(
  request: Request,
): Promise<AdminAccessResult> {
  const auth = await requireSupabaseUser(request);

  if (!auth.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: auth.error },
        { status: auth.status },
      ),
    };
  }

  const email = auth.user.email?.toLowerCase();

  if (!email) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden. Admin email is missing." },
        { status: 403 },
      ),
    };
  }

  const adminEmails = getAdminEmails();

  if (!adminEmails.includes(email)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden. Admin access required." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    adminEmail: email,
    userId: auth.user.id,
  };
}