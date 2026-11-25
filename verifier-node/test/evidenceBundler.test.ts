import fs from 'fs';
import path from 'path';
import { Wallet } from 'ethers';
import { createEvidenceBundle } from '../src/evidence/evidenceBundler';
import { ScoringResult } from '../src/scoring/scorer';
import { EvidenceBundle } from '../../shared/types';

const fixturePath = path.join(__dirname, 'fixtures', 'evidence-bundle-v0.1.json');

describe('Evidence bundler v0.2', () => {
  it('emits a v0.2 EvidenceBundle with required fields', async () => {
    process.env.MAMV_CHAIN_ID = '421614';
    const wallet = new Wallet(
      '0x59c6995e998f97a5a0044986f3d5d7f2d9d2f5a7a4f8c99e8c7c7f9f29c9f7f7'
    );
    const marketplaceAddress = '0x0000000000000000000000000000000000000002';

    const responses = [
      {
        response: 'Paris is the capital of France.',
        model: 'gpt-4',
        provider: 'openai',
        timestamp: Date.now(),
        metadata: {
          duration: 1234,
          tokensUsed: 150,
        },
      },
    ];

    const scoringResult: ScoringResult = {
      score: 95,
      verdict: 'reliable',
      confidence: 0.96,
      bft_quorum: true,
      outliers: [],
      vote_merkle_root: `0x${'aa'.repeat(32)}`,
      breakdown: {
        consistency: 92,
        agreement: 94,
        citationQuality: 100,
        factualAccuracy: 94,
        similarityBonus: 0,
      },
      claim_graph: {
        agreement_ratio: 1,
        contradiction_count: 0,
        citation_coverage: 1,
        total_claims: 1,
        score_components: {
          coverage_bps: 10000,
          contradiction_penalty_bps: 0,
          citation_quality_bps: 10000,
          final_score_bps: 9500,
        },
        claim_summary: [
          {
            cluster_id: 'c1',
            canonical_text: 'Paris is the capital of France.',
            supported_by: ['openai:gpt-4'],
            contradicted_by: [],
            citations: [],
          },
        ],
        highlights: [],
      },
      reasoning: 'Verified across 1 model.',
    };

    const bundle = await createEvidenceBundle({
      taskId: '0x' + '11'.repeat(32),
      nodeId: 'node:test',
      ethAddress: wallet.address,
      promptHash: '0x' + '22'.repeat(32),
      responses,
      scoringResult,
      wallet,
      marketplaceAddress,
    });

    expect(bundle.task_id).toBeDefined();
    expect(bundle.version).toBe('1.1.0');
    expect(bundle.bundle_version).toBe('0.2');
    expect(bundle.created_at).toBeDefined();
    expect(bundle.model_runs.length).toBeGreaterThan(0);
    expect(bundle.claims.length).toBeGreaterThan(0);
    expect(bundle.metrics).toBeDefined();
    expect(bundle.signatures.bundle_sig_eip712).toMatch(/^0x/);

    if (bundle.bundle_version === '0.2' && 'scoring_trace' in bundle) {
      expect(bundle.input.content_hash).toMatch(/^0x/);
      expect(bundle.output.content_hash).toMatch(/^0x/);
      expect(bundle.provenance.model_runs.length).toBeGreaterThan(0);
      expect(bundle.scoring_trace.score_bps).toBeGreaterThan(0);
    } else {
      throw new Error('Expected v0.2 bundle');
    }

    expect((bundle as any).jobId).toBeUndefined();
    expect((bundle as any).modelResponses).toBeUndefined();
    expect((bundle as any).analysis).toBeUndefined();
  });

  it('fixture represents a canonical v0.1 bundle shape', () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as EvidenceBundle;

    expect(fixture.task_id).toMatch(/^0x/);
    expect(fixture.version).toBe('1.0.0');
    expect(fixture.bundle_version).toBe('0.1');
    expect(fixture.created_at).toBeDefined();
    expect(fixture.evaluator?.eth_address).toMatch(/^0x/);
    expect(Array.isArray(fixture.model_runs)).toBe(true);
    expect(Array.isArray(fixture.claims)).toBe(true);
    expect(fixture.metrics).toBeDefined();
    expect(fixture.final_score_bps).toBeGreaterThan(0);
    expect(fixture.signatures?.bundle_sig_eip712).toMatch(/^0x/);
  });
});
