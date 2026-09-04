import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { classify, parsePayments } from "@/lib/model";
import { fetchWorkbook } from "@/lib/sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hash both sides so the comparison is constant-time and length-independent. */
function matches(supplied: string, expected: string): boolean {
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Small in-memory throttle. Serverless instances are short-lived, so this
 *  slows down casual guessing rather than providing a hard guarantee. */
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: now });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_ATTEMPTS;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  const expected = process.env.PAYMENTS_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "No password is configured. Set PAYMENTS_PASSWORD and redeploy." },
      { status: 503 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (tooManyAttempts(ip)) {
    await sleep(1000);
    return NextResponse.json(
      { error: "Too many attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  let supplied = "";
  try {
    supplied = String(((await request.json()) as { password?: unknown }).password ?? "");
  } catch {
    supplied = "";
  }

  if (!supplied || !matches(supplied, expected)) {
    await sleep(400);
    return NextResponse.json({ error: "That password didn't work." }, { status: 401 });
  }

  // Only past this point does any payment data get read or serialized.
  const tabs = await fetchWorkbook();
  const tab = tabs.find((t) => classify(t) === "payments");
  if (!tab) {
    return NextResponse.json({ error: "No payments tab found in the sheet." }, { status: 404 });
  }

  return NextResponse.json(
    { payments: parsePayments(tab) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
