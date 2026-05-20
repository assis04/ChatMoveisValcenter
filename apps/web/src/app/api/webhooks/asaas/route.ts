import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();

  // TODO Module 4: Process Asaas payment webhook events
  console.log("[webhook:asaas]", JSON.stringify(body).slice(0, 200));

  return NextResponse.json({ received: true });
}
