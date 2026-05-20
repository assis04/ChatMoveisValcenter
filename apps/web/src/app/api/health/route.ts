import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "chatcenter-app",
    timestamp: new Date().toISOString(),
  });
}
