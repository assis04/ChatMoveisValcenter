import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();

  // TODO Module 2: Process Evolution API webhook events
  console.log("[webhook:evolution]", JSON.stringify(body).slice(0, 200));

  return NextResponse.json({ received: true });
}
