import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log("NOWPayments IPN received:", body);

    return NextResponse.json({
      ok: true,
      received: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid NOWPayments webhook payload",
      },
      { status: 400 }
    );
  }
}