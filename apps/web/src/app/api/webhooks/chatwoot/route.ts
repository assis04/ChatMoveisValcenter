import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();

  // TODO Module 2: Process Chatwoot webhook events
  // Events: conversation_created, conversation_updated, message_created, etc.
  console.log("[webhook:chatwoot]", JSON.stringify(body).slice(0, 200));

  return NextResponse.json({ received: true });
}
