import { NextFunction, Request, Response } from 'express';
import type { CorsOptions } from 'cors';
import { resolveOrganizationContext, TenantRequest } from '../tenancy/context';
import { can, OrganizationContext, permissions } from '../tenancy/authorization';
import type { ApiKeyScope } from '../tenancy/apiKeys';

type Env = NodeJS.ProcessEnv;

export const MIN_PRODUCTION_JWT_SECRET_LENGTH = 32;

export function isProduction(env: Env = process.env): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * A local sandbox runs with both the mock verifier and the mock chain, so no
 * provider credits are spent and no real keys sign anything.
 */
export function isLocalSandbox(env: Env = process.env): boolean {
  return env.MOCK_VERIFIER === 'true' && env.MOCK_CHAIN === 'true';
}

/**
 * Anonymous access to gated routes is an explicit opt-in, and it is ignored in
 * production unless the API is running as a fully mocked local sandbox.
 */
export function allowAnonymousAccess(env: Env = process.env): boolean {
  if (env.ALLOW_ANONYMOUS_ACCESS !== 'true') return false;
  return !isProduction(env) || isLocalSandbox(env);
}

export function requireJwtSecret(env: Env = process.env): string {
  const secret = env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  if (isProduction(env) && secret.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters in production`);
  }
  return secret;
}

export function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
}

/**
 * CORS policy:
 * - an explicit allowlist (comma-separated CORS_ORIGIN) may use credentials;
 * - a wildcard never carries credentials;
 * - production requires an explicit, non-wildcard allowlist.
 */
export function resolveCorsOptions(env: Env = process.env): CorsOptions {
  const origins = parseCorsOrigins(env.CORS_ORIGIN);
  const wildcard = origins.length === 0 || origins.includes('*');
  if (wildcard) {
    if (isProduction(env) && !isLocalSandbox(env)) {
      throw new Error('CORS_ORIGIN must be an explicit comma-separated allowlist in production');
    }
    return { origin: '*', credentials: false };
  }
  return { origin: origins, credentials: true };
}

/**
 * Collects configuration problems. In production (outside a mocked sandbox)
 * these are fatal at startup; elsewhere they are logged as warnings.
 */
export function securityConfigProblems(env: Env = process.env): string[] {
  const problems: string[] = [];
  try { requireJwtSecret(env); } catch (error) { problems.push((error as Error).message); }
  try { resolveCorsOptions(env); } catch (error) { problems.push((error as Error).message); }
  if (env.ALLOW_ANONYMOUS_ACCESS === 'true' && isProduction(env) && !isLocalSandbox(env)) {
    problems.push('ALLOW_ANONYMOUS_ACCESS is ignored in production unless MOCK_VERIFIER and MOCK_CHAIN are both true');
  }
  return problems;
}

export function securityConfigIsFatal(env: Env = process.env): boolean {
  return isProduction(env) && !isLocalSandbox(env);
}

export type Capability = { scope: ApiKeyScope; permission: keyof typeof permissions };

export const CAPABILITIES = {
  createVerification: { scope: 'verifications:create', permission: 'createVerification' },
  readReceipts: { scope: 'receipts:read', permission: 'readResources' },
  writeReceipts: { scope: 'receipts:write', permission: 'writeReceipts' },
} as const satisfies Record<string, Capability>;

export function contextHasCapability(context: OrganizationContext, capability: Capability): boolean {
  if (context.authType === 'api-key') return (context.scopes ?? []).includes(capability.scope);
  return can(context.role, capability.permission);
}

/**
 * Requires an organization API key carrying `capability.scope`, or a session
 * whose role grants `capability.permission`. Anonymous callers pass through
 * only when `allowAnonymousAccess()` is true; they then have no
 * organizationContext.
 */
export function requireCapability(capability: Capability) {
  return async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const context = await resolveOrganizationContext(req);
      if (!context) {
        if (allowAnonymousAccess()) return next();
        return res.status(401).json({ error: 'Unauthorized', message: 'An organization session or API key is required' });
      }
      if (!contextHasCapability(context, capability)) {
        return res.status(403).json({ error: 'Forbidden', message: `Missing required scope: ${capability.scope}` });
      }
      req.organizationContext = context;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * The requester identity used for quotas, decision gates, and request records.
 * It is derived from authenticated credentials only; client-supplied headers
 * such as `x-requester-id` are never trusted.
 */
export function requesterIdFor(req: Request): string {
  const context = (req as TenantRequest).organizationContext;
  if (context?.authType === 'api-key' && context.apiKeyId) return `org:${context.organizationId}:key:${context.apiKeyId}`;
  if (context?.userId) return `org:${context.organizationId}:user:${context.userId}`;
  if (context) return `org:${context.organizationId}`;
  return `anon:${req.ip || 'unknown'}`;
}

/** Resource owner recorded with debug traces and idempotency records. */
export function ownerIdFor(req: Request): string {
  const context = (req as TenantRequest).organizationContext;
  return context ? `org:${context.organizationId}` : 'anonymous';
}
