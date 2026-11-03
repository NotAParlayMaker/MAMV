import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { OrganizationContext } from '../src/tenancy/authorization';

const contexts: Record<string, OrganizationContext> = {
  verifier: { organizationId: 'org-a', apiKeyId: 'key-1', authType: 'api-key', scopes: ['verifications:create'] },
  reader: { organizationId: 'org-a', apiKeyId: 'key-2', authType: 'api-key', scopes: ['receipts:read'] },
  viewer: { organizationId: 'org-a', userId: 'user-1', role: 'viewer', authType: 'session' },
  member: { organizationId: 'org-a', userId: 'user-2', role: 'member', authType: 'session' },
};
jest.mock('../src/tenancy/context', () => ({
  resolveOrganizationContext: async (req: express.Request) => contexts[req.header('authorization') ?? ''] ?? null,
}));

import {
  allowAnonymousAccess,
  CAPABILITIES,
  requesterIdFor,
  requireCapability,
  requireJwtSecret,
  resolveCorsOptions,
  securityConfigIsFatal,
  securityConfigProblems,
} from '../src/middleware/security';

const STRONG_SECRET = 'x'.repeat(32);

function appWithGate() {
  const app = express();
  app.post('/gated', requireCapability(CAPABILITIES.createVerification), (req, res) => {
    res.json({ requesterId: requesterIdFor(req) });
  });
  return app;
}

describe('requireCapability', () => {
  const originalAnon = process.env.ALLOW_ANONYMOUS_ACCESS;
  afterEach(() => { process.env.ALLOW_ANONYMOUS_ACCESS = originalAnon; });

  it('rejects anonymous callers by default', async () => {
    delete process.env.ALLOW_ANONYMOUS_ACCESS;
    expect((await request(appWithGate()).post('/gated')).status).toBe(401);
  });

  it('accepts an API key with the required scope', async () => {
    const res = await request(appWithGate()).post('/gated').set('authorization', 'verifier');
    expect(res.status).toBe(200);
    expect(res.body.requesterId).toBe('org:org-a:key:key-1');
  });

  it('rejects an API key without the required scope', async () => {
    expect((await request(appWithGate()).post('/gated').set('authorization', 'reader')).status).toBe(403);
  });

  it('applies role permissions to sessions', async () => {
    expect((await request(appWithGate()).post('/gated').set('authorization', 'viewer')).status).toBe(403);
    const member = await request(appWithGate()).post('/gated').set('authorization', 'member');
    expect(member.status).toBe(200);
    expect(member.body.requesterId).toBe('org:org-a:user:user-2');
  });

  it('never trusts a client-supplied x-requester-id', async () => {
    const res = await request(appWithGate()).post('/gated').set('authorization', 'verifier').set('x-requester-id', 'someone-else');
    expect(res.body.requesterId).toBe('org:org-a:key:key-1');
  });

  it('lets anonymous callers through only when explicitly allowed', async () => {
    process.env.ALLOW_ANONYMOUS_ACCESS = 'true';
    const res = await request(appWithGate()).post('/gated').set('x-requester-id', 'spoofed');
    expect(res.status).toBe(200);
    expect(res.body.requesterId).toMatch(/^anon:/);
  });
});

describe('allowAnonymousAccess', () => {
  it('is off unless opted in', () => {
    expect(allowAnonymousAccess({ NODE_ENV: 'development' })).toBe(false);
    expect(allowAnonymousAccess({ NODE_ENV: 'development', ALLOW_ANONYMOUS_ACCESS: 'true' })).toBe(true);
  });

  it('is ignored in production unless fully mocked', () => {
    expect(allowAnonymousAccess({ NODE_ENV: 'production', ALLOW_ANONYMOUS_ACCESS: 'true' })).toBe(false);
    expect(allowAnonymousAccess({ NODE_ENV: 'production', ALLOW_ANONYMOUS_ACCESS: 'true', MOCK_VERIFIER: 'true' })).toBe(false);
    expect(allowAnonymousAccess({ NODE_ENV: 'production', ALLOW_ANONYMOUS_ACCESS: 'true', MOCK_VERIFIER: 'true', MOCK_CHAIN: 'true' })).toBe(true);
  });
});

describe('requireJwtSecret', () => {
  it('fails closed when unset', () => {
    expect(() => requireJwtSecret({})).toThrow(/not configured/);
  });

  it('requires a long secret in production', () => {
    expect(() => requireJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'short' })).toThrow(/at least 32/);
    expect(requireJwtSecret({ NODE_ENV: 'production', JWT_SECRET: STRONG_SECRET })).toBe(STRONG_SECRET);
  });
});

describe('resolveCorsOptions', () => {
  it('never pairs a wildcard origin with credentials', () => {
    expect(resolveCorsOptions({})).toEqual({ origin: '*', credentials: false });
    expect(resolveCorsOptions({ CORS_ORIGIN: '*' })).toEqual({ origin: '*', credentials: false });
  });

  it('allows credentials for an explicit allowlist', () => {
    expect(resolveCorsOptions({ CORS_ORIGIN: 'https://a.example, https://b.example' })).toEqual({
      origin: ['https://a.example', 'https://b.example'],
      credentials: true,
    });
  });

  it('requires an explicit allowlist in production', () => {
    expect(() => resolveCorsOptions({ NODE_ENV: 'production' })).toThrow(/allowlist/);
    expect(() => resolveCorsOptions({ NODE_ENV: 'production', CORS_ORIGIN: '*' })).toThrow(/allowlist/);
  });
});

describe('securityConfigProblems', () => {
  it('is clean for a well-configured production deployment', () => {
    const env = { NODE_ENV: 'production', JWT_SECRET: STRONG_SECRET, CORS_ORIGIN: 'https://app.example' };
    expect(securityConfigProblems(env)).toEqual([]);
    expect(securityConfigIsFatal(env)).toBe(true);
  });

  it('reports every problem in an insecure production deployment', () => {
    const problems = securityConfigProblems({ NODE_ENV: 'production', ALLOW_ANONYMOUS_ACCESS: 'true' });
    expect(problems).toHaveLength(3);
  });

  it('is not fatal for a mocked local sandbox', () => {
    expect(securityConfigIsFatal({ NODE_ENV: 'production', MOCK_VERIFIER: 'true', MOCK_CHAIN: 'true' })).toBe(false);
  });
});
