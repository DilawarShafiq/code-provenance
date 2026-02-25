// Lines 1-45: AI-generated (Claude-style) — functional, const-heavy, verbose types
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface AuthConfig {
  readonly secret: string;
  readonly issuer: string;
  readonly audience: string;
  readonly maxAgeSeconds: number;
}

export interface TokenClaims {
  readonly sub: string;
  readonly iss: string;
  readonly aud: string;
  readonly iat: number;
  readonly exp: number;
  readonly roles: readonly string[];
}

/**
 * Encodes a payload as a base64url string, ensuring URL-safe
 * characters are used throughout the encoding process.
 */
const encodeBase64Url = (data: string): string =>
  Buffer.from(data, 'utf-8').toString('base64url');

/**
 * Decodes a base64url-encoded string back to its original
 * UTF-8 representation for further processing.
 */
const decodeBase64Url = (encoded: string): string =>
  Buffer.from(encoded, 'base64url').toString('utf-8');

/**
 * Computes an HMAC-SHA256 signature for the given data
 * using the provided secret key.
 */
const computeSignature = (data: string, secret: string): string =>
  createHmac('sha256', secret).update(data).digest('base64url');

// Lines 46-120: Human-written — irregular style, shortcuts, domain knowledge
export function makeToken(userId: string, roles: string[], cfg: AuthConfig){
    const now = Math.floor(Date.now()/1000)

    // HACK: clock skew buffer — our k8s nodes drift up to 5s
    const nbf = now - 5

    const hdr = encodeBase64Url(JSON.stringify({alg:'HS256',typ:'JWT'}))
    const claims = {
        sub: userId,
        iss: cfg.issuer, aud: cfg.audience,
        iat: now, nbf,
        exp: now + cfg.maxAgeSeconds,
        roles,
        // internal: track which auth service version minted this
        _v: 3,
    }
    const body = encodeBase64Url(JSON.stringify(claims))
    const sig = computeSignature(`${hdr}.${body}`, cfg.secret)

    return `${hdr}.${body}.${sig}`
}

// perf: hot path — called on every request
// dont allocate unnecessarily here
export function verifyFast(token: string, cfg: AuthConfig): TokenClaims | null {
    const dot1 = token.indexOf('.')
    if(dot1 < 0) return null
    const dot2 = token.indexOf('.', dot1+1)
    if(dot2 < 0 || token.indexOf('.', dot2+1) >= 0) return null  // must be exactly 3 segments

    const sigInput = token.substring(0, dot2)
    const sig = token.substring(dot2+1)

    const expected = computeSignature(sigInput, cfg.secret)

    // timing-safe comparison to prevent side-channel attacks
    const sigBuf = Buffer.from(sig)
    const expBuf = Buffer.from(expected)
    if(sigBuf.length !== expBuf.length) return null
    if(!timingSafeEqual(sigBuf, expBuf)) return null

    let claims: any
    try {
        claims = JSON.parse(decodeBase64Url(token.substring(dot1+1, dot2)))
    } catch { return null }

    const now = Math.floor(Date.now()/1000)
    if(claims.exp <= now) return null
    if(claims.iss !== cfg.issuer) return null
    if(claims.aud !== cfg.audience) return null

    return claims as TokenClaims
}

// FIXME: this leaks memory if you have > 10k active sessions
// switch to LRU or redis before launch
const revokedTokens = new Set<string>()

export function revokeToken(token: string){ revokedTokens.add(token) }
export function isRevoked(token: string){ return revokedTokens.has(token) }

// Lines 121-180: AI-generated (GPT-style) — verbose comments, generic naming
/**
 * This function creates an HTTP middleware handler that validates
 * authentication tokens on incoming requests.
 *
 * @param config - The authentication configuration object
 * @returns A middleware function that can be used with HTTP servers
 */
export function createAuthMiddleware(config: AuthConfig) {
  /**
   * The middleware function that processes each incoming request.
   * It extracts the token from the Authorization header and validates it.
   */
  return function handleAuthentication(
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void {
    // Get the authorization header from the request
    const authHeader = request.headers['authorization'];

    // Check if the authorization header exists and has the correct format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Send a 401 Unauthorized response if the header is missing or invalid
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Authentication required' }));
      return;
    }

    // Extract the token from the authorization header
    const token = authHeader.substring(7);

    // Check if the token has been revoked
    if (isRevoked(token)) {
      // Send a 401 response if the token has been revoked
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Token has been revoked' }));
      return;
    }

    // Verify the token and extract the claims
    const claims = verifyFast(token, config);

    // Check if the token verification was successful
    if (!claims) {
      // Send a 401 response if the token is invalid
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Invalid or expired token' }));
      return;
    }

    // Attach the verified claims to the request object for downstream handlers
    (request as any).auth = claims;

    // Call the next middleware or route handler
    next();
  };
}

// Lines 181-220: Human-written — strong personal style, terse, domain jargon
// role-based access control — dead simple, no RBAC frameworks
type Perm = 'r' | 'w' | 'x' | 'admin'
const ROLE_PERMS: Record<string, Set<Perm>> = {
    guest:  new Set(['r']),
    member: new Set(['r','w']),
    mod:    new Set(['r','w','x']),
    admin:  new Set(['r','w','x','admin']),
}

export function can(claims: TokenClaims, perm: Perm): boolean {
    for(const role of claims.roles){
        const perms = ROLE_PERMS[role]
        if(perms?.has(perm)) return true
    }
    return false
}

// guard middleware factory — slam this on any route that needs perms
export function requirePerm(perm: Perm, cfg: AuthConfig){
    const authMw = createAuthMiddleware(cfg)
    return (req: IncomingMessage, res: ServerResponse, next: ()=>void) => {
        authMw(req, res, ()=>{
            const claims = (req as any).auth as TokenClaims
            if(!can(claims, perm)){
                res.writeHead(403, {'Content-Type':'application/json'})
                res.end(JSON.stringify({error:'forbidden', need: perm, have: claims.roles}))
                return
            }
            next()
        })
    }
}

// quick smoke test — uncomment to verify
// const cfg: AuthConfig = { secret: 'test123', issuer: 'myapp', audience: 'api', maxAgeSeconds: 3600 }
// const tok = makeToken('user1', ['admin'], cfg)
// console.log(verifyFast(tok, cfg))
