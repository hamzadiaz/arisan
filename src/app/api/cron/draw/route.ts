/**
 * Arisan Auto-Draw Cron Job
 *
 * This API route is called by Vercel Cron to automatically execute draws
 * when pool deadlines pass. It runs every minute.
 *
 * Security:
 * - Protected by CRON_SECRET header (set in Vercel)
 * - Only processes pools with autoMode enabled
 * - Uses permissionless execute_draw (anyone can call after deadline)
 */

import { NextRequest, NextResponse } from "next/server";
import { processDraws } from "@/lib/solana/scheduler";
import { withRateLimit } from "@/lib/rate-limit";

const recentHits = new Map<string, number[]>();

function cronRateLimited(request: NextRequest): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const now = Date.now();
  const recent = (recentHits.get(ip) ?? []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= 6) {
    recentHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  recentHits.set(ip, recent);
  return false;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function authorizeCron(presented: string | null): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || presented !== cronSecret) {
    return unauthorized();
  }
  return null;
}

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60 seconds for processing

/**
 * GET /api/cron/draw
 *
 * Called by Vercel Cron every minute to process pending draws
 */
export async function GET(request: NextRequest) {
  console.log("=== Cron Draw Endpoint Called ===");

  const rateLimitResponse = await withRateLimit(request, "strict");
  if (rateLimitResponse) return rateLimitResponse;
  if (cronRateLimited(request)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const authHeader = request.headers.get("authorization");
  const presented = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const denied = authorizeCron(presented);
  if (denied) return denied;

  // Check if scheduler is configured
  if (!process.env.SCHEDULER_PRIVATE_KEY) {
    console.error("SCHEDULER_PRIVATE_KEY not configured");
    return NextResponse.json(
      { error: "Scheduler not configured" },
      { status: 500 }
    );
  }

  try {
    // Process all pending draws
    const result = await processDraws();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/draw
 *
 * Manual trigger endpoint (for testing)
 * Requires CRON_SECRET in body
 */
export async function POST(request: NextRequest) {
  console.log("=== Manual Draw Trigger ===");

  try {
    if (cronRateLimited(request)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const denied = authorizeCron(typeof body.secret === "string" ? body.secret : null);
    if (denied) return denied;

    // Check if scheduler is configured
    if (!process.env.SCHEDULER_PRIVATE_KEY) {
      return NextResponse.json(
        { error: "SCHEDULER_PRIVATE_KEY not configured" },
        { status: 500 }
      );
    }

    // Process draws
    const result = await processDraws();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    console.error("Manual trigger error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
