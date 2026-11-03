import { DebugTrace } from '../../../shared/observability/debugTrace';
import { redisClient } from './redis';

/**
 * Debug traces are stored with the owner that created them (an organization
 * identifier, or `anonymous` for sandbox callers) so the read endpoint can
 * enforce tenant isolation.
 */
const inMemoryStore = new Map<string, { trace: DebugTrace; ownerId?: string }>();

function getKey(jobId: string) {
  return `debug:trace:${jobId}`;
}

function getOwnerKey(jobId: string) {
  return `debug:trace-owner:${jobId}`;
}

export async function storeDebugTrace(jobId: string, trace: DebugTrace, ownerId?: string): Promise<void> {
  if (!redisClient) {
    inMemoryStore.set(jobId, { trace, ownerId });
    return;
  }
  await redisClient.set(getKey(jobId), JSON.stringify(trace));
  if (ownerId) await redisClient.set(getOwnerKey(jobId), ownerId);
}

export async function getDebugTrace(jobId: string): Promise<DebugTrace | null> {
  if (!redisClient) {
    return inMemoryStore.get(jobId)?.trace ?? null;
  }
  const raw = await redisClient.get(getKey(jobId));
  return raw ? (JSON.parse(raw) as DebugTrace) : null;
}

export async function getDebugTraceOwner(jobId: string): Promise<string | null> {
  if (!redisClient) {
    return inMemoryStore.get(jobId)?.ownerId ?? null;
  }
  return (await redisClient.get(getOwnerKey(jobId))) ?? null;
}
