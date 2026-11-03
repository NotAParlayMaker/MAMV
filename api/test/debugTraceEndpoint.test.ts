import express from 'express';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { OrganizationContext } from '../src/tenancy/authorization';

// Resolve credentials from a test header instead of the database.
const contexts: Record<string, OrganizationContext> = {
  'org-a-reader': { organizationId: 'org-a', apiKeyId: 'k1', authType: 'api-key', scopes: ['receipts:read'] },
  'org-a-writer-only': { organizationId: 'org-a', apiKeyId: 'k2', authType: 'api-key', scopes: ['verifications:create'] },
  'org-b-reader': { organizationId: 'org-b', apiKeyId: 'k3', authType: 'api-key', scopes: ['receipts:read'] },
};
jest.mock('../src/tenancy/context', () => ({
  resolveOrganizationContext: async (req: express.Request) => contexts[req.header('authorization') ?? ''] ?? null,
}));

import { jobRoutes } from '../src/routes/jobs';
import { storeDebugTrace } from '../src/services/debugTraceStore';
import { createDebugTrace, endStage, startStage } from '../../shared/observability/debugTrace';

const app = express();
app.use('/api/jobs', jobRoutes);

describe('debug trace endpoint', () => {
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    const trace = createDebugTrace('job-trace', 'trace-123');
    startStage(trace, 'ingest/validate');
    endStage(trace, 'ingest/validate', 'ok');
    await storeDebugTrace('job-trace', trace, 'org:org-a');
    await storeDebugTrace('job-unowned', createDebugTrace('job-unowned', 'trace-456'));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns stored trace stages to the owning organization', async () => {
    const response = await request(app).get('/api/jobs/job-trace/trace').set('authorization', 'org-a-reader');
    expect(response.status).toBe(200);
    expect(response.body.trace.trace_id).toBe('trace-123');
    expect(response.body.trace.stages).toHaveLength(1);
  });

  it('requires credentials', async () => {
    const response = await request(app).get('/api/jobs/job-trace/trace');
    expect(response.status).toBe(401);
  });

  it('requires the receipts:read scope', async () => {
    const response = await request(app).get('/api/jobs/job-trace/trace').set('authorization', 'org-a-writer-only');
    expect(response.status).toBe(403);
  });

  it('hides traces owned by another organization', async () => {
    const response = await request(app).get('/api/jobs/job-trace/trace').set('authorization', 'org-b-reader');
    expect(response.status).toBe(404);
  });

  it('never returns traces without a recorded owner', async () => {
    const response = await request(app).get('/api/jobs/job-unowned/trace').set('authorization', 'org-a-reader');
    expect(response.status).toBe(404);
  });

  it('is disabled in production unless DEBUG_TRACES_ENABLED=true', async () => {
    process.env.NODE_ENV = 'production';
    const disabled = await request(app).get('/api/jobs/job-trace/trace').set('authorization', 'org-a-reader');
    expect(disabled.status).toBe(404);

    process.env.DEBUG_TRACES_ENABLED = 'true';
    const enabled = await request(app).get('/api/jobs/job-trace/trace').set('authorization', 'org-a-reader');
    expect(enabled.status).toBe(200);
  });
});
