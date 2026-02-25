import type { Request, Response, NextFunction } from 'express';
import type { UserPayload } from '../types/auth.js';
import type { JwtConfig } from '../config/jwt.js';

import { createHash, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const generateToken = promisify(randomBytes);

/**
 * Validates the provided authentication token against the expected format
 * and returns the decoded payload if valid.
 */
export const validateAuthToken = (
  token: string,
  config: Readonly<JwtConfig>,
): UserPayload | null => {
  const segments = token.split('.');

  if (segments.length !== 3) {
    return null;
  }

  const [header, payload, signature] = segments;

  const expectedSignature = createHash('sha256')
    .update(`${header}.${payload}`)
    .update(config.secret)
    .digest('base64url');

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8'),
    ) as UserPayload;

    if (decoded.exp && decoded.exp < Date.now() / 1000) {
      return null;
    }

    return Object.freeze(decoded);
  } catch {
    return null;
  }
};

/**
 * Creates a new authentication token for the given user payload
 * with the specified expiration time.
 */
export const createAuthToken = (
  payload: Readonly<UserPayload>,
  config: Readonly<JwtConfig>,
): string => {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');

  const expiresAt = Math.floor(Date.now() / 1000) + config.expiresInSeconds;

  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: expiresAt }),
  ).toString('base64url');

  const signature = createHash('sha256')
    .update(`${header}.${body}`)
    .update(config.secret)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
};

/**
 * Express middleware that extracts and validates the Bearer token
 * from the Authorization header, attaching the decoded user to the request.
 */
export const authMiddleware = (
  config: Readonly<JwtConfig>,
) => (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next(new Error('Missing or invalid Authorization header'));
    return;
  }

  const token = authHeader.slice(7);
  const user = validateAuthToken(token, config);

  if (!user) {
    next(new Error('Invalid or expired authentication token'));
    return;
  }

  (req as Request & { user: UserPayload }).user = user;
  next();
};

/**
 * Generates a cryptographically secure session identifier
 * using random bytes encoded as a hexadecimal string.
 */
export const generateSessionId = async (): Promise<string> => {
  const bytes = await generateToken(32);
  return bytes.toString('hex');
};

/**
 * Hashes a password using SHA-256 with a random salt.
 * Returns the salt and hash concatenated with a separator.
 */
export const hashPassword = async (
  password: string,
): Promise<string> => {
  const salt = (await generateToken(16)).toString('hex');
  const hash = createHash('sha256')
    .update(salt + password)
    .digest('hex');
  return `${salt}:${hash}`;
};

/**
 * Verifies a password against a stored hash by extracting the salt,
 * recomputing the hash, and comparing the results.
 */
export const verifyPassword = (
  password: string,
  storedHash: string,
): boolean => {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) {
    return false;
  }
  const computedHash = createHash('sha256')
    .update(salt + password)
    .digest('hex');
  return computedHash === hash;
};
