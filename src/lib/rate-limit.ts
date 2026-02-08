import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

// Initialize Redis client (will gracefully fail if not configured)
let redis: Redis | null = null;
let rateLimiter: Ratelimit | null = null;

function initRateLimiter() {
  if (rateLimiter) return rateLimiter;

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    console.warn("Rate limiting disabled: UPSTASH_REDIS credentials not configured");
    return null;
  }

  try {
    redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });

    rateLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "10 s"), // 10 requests per 10 seconds
      analytics: true,
      prefix: "arisan",
    });

    return rateLimiter;
  } catch (error) {
    console.error("Failed to initialize rate limiter:", error);
    return null;
  }
}

// Different rate limits for different endpoints
export const rateLimits = {
  // Strict: sensitive operations
  strict: { requests: 5, window: "60 s" as const },
  // Standard: normal API calls
  standard: { requests: 30, window: "60 s" as const },
  // Relaxed: read-only operations
  relaxed: { requests: 100, window: "60 s" as const },
};

export type RateLimitType = keyof typeof rateLimits;

// Get identifier for rate limiting (IP or user ID)
export function getIdentifier(request: NextRequest, userId?: string): string {
  if (userId) {
    return `user:${userId}`;
  }

  // Get IP from various headers (Vercel, Cloudflare, etc.)
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");

  const ip = cfConnectingIp || realIp || forwardedFor?.split(",")[0] || "unknown";
  return `ip:${ip}`;
}

// Rate limit check function
export async function checkRateLimit(
  identifier: string,
  type: RateLimitType = "standard"
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const limiter = initRateLimiter();

  if (!limiter) {
    // Rate limiting disabled, allow all requests
    return { success: true, remaining: 999, reset: 0 };
  }

  const limit = rateLimits[type];
  const key = `${type}:${identifier}`;

  try {
    const result = await limiter.limit(key);
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    console.error("Rate limit check failed:", error);
    // On error, allow the request but log it
    return { success: true, remaining: 0, reset: 0 };
  }
}

// Middleware helper for API routes
export async function withRateLimit(
  request: NextRequest,
  type: RateLimitType = "standard",
  userId?: string
): Promise<NextResponse | null> {
  const identifier = getIdentifier(request, userId);
  const result = await checkRateLimit(identifier, type);

  if (!result.success) {
    return NextResponse.json(
      {
        error: "Too many requests",
        message: "Please wait before making more requests",
        retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": result.remaining.toString(),
          "X-RateLimit-Reset": result.reset.toString(),
          "Retry-After": Math.ceil((result.reset - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  return null; // No rate limit hit, proceed with request
}

// Helper to add rate limit headers to successful responses
export function addRateLimitHeaders(
  response: NextResponse,
  remaining: number,
  reset: number
): NextResponse {
  response.headers.set("X-RateLimit-Remaining", remaining.toString());
  response.headers.set("X-RateLimit-Reset", reset.toString());
  return response;
}
