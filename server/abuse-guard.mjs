import {isIP} from 'node:net';
import {createHash} from 'node:crypto';

// Only trust addresses appended by explicitly configured proxy hops. User-supplied
// prefixes never select a separate bucket. A local server trusts its socket only.
export function clientKey(request, trustedProxyHops = 0) {
  let address = request.socket.remoteAddress || 'unknown';
  if (trustedProxyHops > 0) {
    const raw = request.headers['x-forwarded-for'];
    const chain = (Array.isArray(raw) ? raw.join(',') : raw || '').split(',').map(value => value.trim());
    const candidate = chain[chain.length - trustedProxyHops];
    if (candidate && isIP(candidate)) address = candidate;
  }
  if (address.startsWith('::ffff:')) address = address.slice(7);
  return createHash('sha256').update(address).digest('hex');
}

export class TokenBucket {
  constructor({capacity, refillPerSecond, maxKeys = 10000, now = Date.now}) {
    this.capacity = capacity; this.refillPerSecond = refillPerSecond;
    this.maxKeys = maxKeys; this.now = now; this.entries = new Map();
  }
  consume(key) {
    const now = this.now();
    if (!this.entries.has(key) && this.entries.size >= this.maxKeys) {
      const lifetime = this.capacity / this.refillPerSecond * 1000;
      for (const [id, entry] of this.entries) if (now - entry.updatedAt >= lifetime) this.entries.delete(id);
      if (this.entries.size >= this.maxKeys) return {allowed: false, retryAfter: Math.ceil(lifetime / 1000)};
    }
    const old = this.entries.get(key) || {tokens: this.capacity, updatedAt: now};
    const tokens = Math.min(this.capacity, old.tokens + Math.max(0, now - old.updatedAt) / 1000 * this.refillPerSecond);
    const allowed = tokens >= 1;
    this.entries.set(key, {tokens: allowed ? tokens - 1 : tokens, updatedAt: now});
    return {allowed, retryAfter: allowed ? 0 : Math.max(1, Math.ceil((1 - tokens) / this.refillPerSecond))};
  }
}

export function createAbuseGuard({trustedProxyHops = 0, now = Date.now} = {}) {
  const buckets = {
    login: new TokenBucket({capacity: 5, refillPerSecond: 1 / 12, now}),
    api: new TokenBucket({capacity: 60, refillPerSecond: 1, now}),
    globalLogin: new TokenBucket({capacity: 30, refillPerSecond: 1, maxKeys: 1, now}),
    globalApi: new TokenBucket({capacity: 600, refillPerSecond: 10, maxKeys: 1, now}),
  };
  return (request, pathname) => {
    if (!pathname.startsWith('/api/')) return {allowed: true, retryAfter: 0};
    const login = pathname === '/api/steam/start';
    const individual = buckets[login ? 'login' : 'api'].consume(clientKey(request, trustedProxyHops));
    if (!individual.allowed) return individual;
    return buckets[login ? 'globalLogin' : 'globalApi'].consume('all');
  };
}
