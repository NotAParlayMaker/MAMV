import { expect } from 'chai';
import {
  clearIdempotencyStore,
  getIdempotencyRecord,
  setIdempotencyRecord,
} from '../src/services/idempotency';
import type { VerifyResponse } from '../../shared/httpSchemas';

describe('Idempotency Store', () => {
  beforeEach(() => {
    clearIdempotencyStore();
  });

  it('Stores and retrieves responses by key', () => {
    const response: VerifyResponse = {
      task_id: '123',
      status: 'queued',
      verdict: 'unknown',
      score_bps: 0,
      evidence: { bundle_hash: null, bundle_uri: null },
      timings: {
        queue_ms: null,
        llm_ms: null,
        bundle_ms: null,
        chain_ms: null,
        total_ms: null,
      },
      errors: [],
    };

    setIdempotencyRecord('org:a', 'key-1', response);
    const record = getIdempotencyRecord('org:a', 'key-1');

    expect(record?.response).to.deep.equal(response);
  });

  it('Does not return another owner\'s record for the same key', () => {
    const response = { task_id: 'secret' } as unknown as VerifyResponse;
    setIdempotencyRecord('org:a', 'shared-key', response);

    expect(getIdempotencyRecord('org:b', 'shared-key')).to.equal(undefined);
  });
});
