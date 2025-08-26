import { RateLimitError } from './errors';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory rate limiting for dev/simple cases
class InMemoryRateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 10) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  async checkLimit(identifier: string): Promise<void> {
    const now = Date.now();
    const entry = this.store.get(identifier);

    if (!entry || now > entry.resetTime) {
      // Reset window
      this.store.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return;
    }

    if (entry.count >= this.maxRequests) {
      throw new RateLimitError(
        `Rate limit exceeded. Try again in ${Math.ceil((entry.resetTime - now) / 1000)} seconds.`
      );
    }

    entry.count++;
    this.store.set(identifier, entry);
  }

  // Cleanup old entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }
}

const rateLimiter = new InMemoryRateLimiter(60000, 10); // 10 requests per minute

// Cleanup every 5 minutes
setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000);

export async function checkRateLimit(identifier: string): Promise<void> {
  await rateLimiter.checkLimit(identifier);
}

export function getRateLimitIdentifier(userId?: string, ip?: string): string {
  return userId || ip || 'anonymous';
}