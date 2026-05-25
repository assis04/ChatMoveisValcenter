import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "validation_failed", issues: err.issues },
      { status: 400 },
    );
  }
  if (err instanceof Error) {
    // Evolution upstream errors carry the status in the message.
    const msg = err.message;
    if (msg.startsWith("Evolution API error")) {
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    if (msg.startsWith("Chatwoot API error")) {
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    if (
      msg.startsWith("invalid group jid") ||
      msg.startsWith("invalid participant phone")
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.json({ error: "unknown_error" }, { status: 500 });
}
