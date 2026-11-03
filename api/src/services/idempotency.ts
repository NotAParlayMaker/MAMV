import { VerifyResponse } from '../../../shared/httpSchemas';

interface IdempotencyRecord {
  response: VerifyResponse;
  createdAt: number;
}

/**
 * Idempotency keys are namespaced by owner so one tenant cannot replay another
 * tenant's key and read back its response.
 */
const idempotencyStore = new Map<string, IdempotencyRecord>();

function scopedKey(ownerId: string, key: string): string {
  return `${ownerId}\u0000${key}`;
}

export function getIdempotencyRecord(ownerId: string, key: string): IdempotencyRecord | undefined {
  return idempotencyStore.get(scopedKey(ownerId, key));
}

export function setIdempotencyRecord(ownerId: string, key: string, response: VerifyResponse): void {
  idempotencyStore.set(scopedKey(ownerId, key), { response, createdAt: Date.now() });
}

export function clearIdempotencyStore(): void {
  idempotencyStore.clear();
}
