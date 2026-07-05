import { NextResponse } from "next/server";
import { buildInvestorDashboardSnapshot } from "@/lib/stockEngineInvestorDashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await buildInvestorDashboardSnapshot({ source: "snapshot" });
    return NextResponse.json(snapshot, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        storageVersion: "s8_38a_investor_snapshot_adapter_v1",
        error:
          error instanceof Error
            ? error.message
            : "Investor snapshot adapter failed.",
      },
      { status: 502 },
    );
  }
}

