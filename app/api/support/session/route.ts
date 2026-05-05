import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type SessionRequestBody = {
  anonymousId?: string;
  language?: string;
  pageUrl?: string;
};

async function getRequestUser(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    const body = (await request.json()) as SessionRequestBody;

    const anonymousId = body.anonymousId || null;
    const language = body.language || "ru";
    const pageUrl = body.pageUrl || null;

    let existingSession = null;

    if (user?.id) {
      const { data } = await supabaseAdmin
        .from("support_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "open")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      existingSession = data;
    } else if (anonymousId) {
      const { data } = await supabaseAdmin
        .from("support_sessions")
        .select("*")
        .eq("anonymous_id", anonymousId)
        .eq("status", "open")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      existingSession = data;
    }

    if (existingSession) {
      const { data: updatedSession, error: updateError } = await supabaseAdmin
        .from("support_sessions")
        .update({
          language,
          page_url: pageUrl,
          customer_email: user?.email || existingSession.customer_email,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingSession.id)
        .select("*")
        .single();

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ session: updatedSession });
    }

    const { data: session, error: insertError } = await supabaseAdmin
      .from("support_sessions")
      .insert({
        user_id: user?.id || null,
        customer_email: user?.email || null,
        anonymous_id: anonymousId,
        language,
        page_url: pageUrl,
        status: "open",
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error("Support session error:", error);

    return NextResponse.json(
      { error: "Failed to create support session." },
      { status: 500 }
    );
  }
}