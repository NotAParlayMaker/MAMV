import { buildReceipt, computeReceiptHash, validateReceipt, type BuildReceiptParams } from '../../shared/receipt';
import {
  EPISTEMIC_DISCLOSURES_VERSION,
  summarizeInformativeness,
  validateEpistemicDisclosures,
  type EpistemicDisclosures,
} from '../../shared/epistemicDisclosures';
import { verdictFromEvidence } from '../../shared/verdicts';
import { validateReceiptV1 } from '../../shared/schemaValidation';

const claims: NonNullable<BuildReceiptParams['claims']> = [
  { id: 'c1', original_text: 'The 2019 trial showed a 31% reduction.', normalized_text: 'trial reduction 31%', claim_type: 'factual', materiality_weight: 1, status: 'assessed', version: 1, content_role: 'literal' },
  { id: 'c2', original_text: 'Most experts may agree.', normalized_text: 'most experts agree', claim_type: 'factual', materiality_weight: 1, status: 'assessed', version: 1, content_role: 'hedged_content' },
  { id: 'c3', original_text: 'So the drug should be first-line.', normalized_text: 'drug first-line', claim_type: 'factual', materiality_weight: 1, status: 'assessed', version: 1, content_role: 'literal' },
];

const baseParams: BuildReceiptParams = {
  task_id: 'disclosures-1',
  input_hash: `0x${'11'.repeat(32)}`,
  output_hash: `0x${'22'.repeat(32)}`,
  score_bps: 8000,
  bundle_hash: `0x${'33'.repeat(32)}`,
  bundle_uri: 'ipfs://QmDisclosures',
  llm_provider: 'mock',
  llm_model: 'mock-llm',
  claims,
};

function disclosures(): EpistemicDisclosures {
  return {
    version: EPISTEMIC_DISCLOSURES_VERSION,
    affects_verdict: false,
    informativeness: summarizeInformativeness(claims, ['c1'], 'declared-specificity/v1', ['Specificity is declared by the verifier, not inferred from phrasing.']),
    inference: { conclusion_claim_ids: ['c3'], premise_claim_ids: ['c1', 'c2'], status: 'partially_follows', basis: 'One trial does not establish first-line suitability.' },
    omissions: [{ evidence_id: 'e9', affected_claim_ids: ['c3'], materiality: 'material', description: 'A 2022 meta-analysis found no effect.' }],
    unable_to_verify: { reason: 'field_contested', detail: 'Guideline bodies disagree.', contested_evidence_ids: ['e1', 'e9'] },
    defeaters: [
      { claim_id: 'c1', kind: 'undercutting', condition: 'The 2019 trial is retracted.', watched_evidence_ids: ['e1'] },
      { claim_id: 'c1', kind: 'rebutting', condition: 'A larger trial finds no reduction.' },
    ],
    precisifications: [{ claim_id: 'c2', term: 'most', reading: 'more than half of surveyed specialists', alternatives_considered: ['a supermajority'], status_sensitive: true }],
  };
}

describe('epistemic disclosures', () => {
  it('summarizes informativeness from declared specific claims, not phrasing', () => {
    const summary = summarizeInformativeness(claims, ['c1', 'c1', 'unknown'], 'm', ['l']);
    expect(summary).toMatchObject({ material_claim_count: 3, specific_claim_count: 1, hedged_claim_count: 1, specific_claim_ids: ['c1'] });
    expect(summary.specificity_ratio).toBeCloseTo(1 / 3);
    expect(summarizeInformativeness([], [], 'm', ['l']).specificity_ratio).toBe(0);
  });

  it('builds a valid, schema-conformant receipt carrying all five disclosures', () => {
    const receipt = buildReceipt({ ...baseParams, epistemic_disclosures: disclosures() });
    expect(validateReceipt(receipt)).toEqual({ valid: true, errors: [] });
    // Only this field is checked here; unrelated schema findings belong to other features.
    const schemaErrors = (validateReceiptV1(receipt).errors ?? []).filter((error: { path?: string }) => String(error.path).startsWith('/epistemic_disclosures'));
    expect(schemaErrors).toEqual([]);
  });

  it('is enforced by the receipt JSON schema', () => {
    const receipt = buildReceipt({ ...baseParams, epistemic_disclosures: disclosures() });
    const bad = { ...receipt, epistemic_disclosures: { ...disclosures(), affects_verdict: true, surprise: 1 } };
    const schemaErrors = (validateReceiptV1(bad).errors ?? []).filter((error: { path?: string }) => String(error.path).startsWith('/epistemic_disclosures'));
    expect(schemaErrors.length).toBeGreaterThanOrEqual(2);
  });

  it('never changes the verdict or the legacy hash of receipts without disclosures', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const without = buildReceipt(baseParams);
    const withDisclosures = buildReceipt({ ...baseParams, epistemic_disclosures: disclosures() });
    expect(withDisclosures.verdict).toBe(without.verdict);
    expect(withDisclosures.verification_status).toBe(without.verification_status);
    expect(withDisclosures.score_bps).toBe(without.score_bps);
    // The verdict function has no disclosure input at all.
    expect(verdictFromEvidence.length).toBe(1);
    // Absent disclosures leave the hash exactly as before.
    const { epistemic_disclosures: _ignored, ...stripped } = withDisclosures;
    expect(computeReceiptHash(stripped)).toBe(without.receipt_hash);
    expect(withDisclosures.receipt_hash).not.toBe(without.receipt_hash);
    jest.useRealTimers();
  });

  it('binds disclosures into the receipt hash independent of array order', () => {
    const a = disclosures();
    const b = disclosures();
    b.defeaters!.reverse();
    b.inference!.premise_claim_ids.reverse();
    const receipt = buildReceipt({ ...baseParams, epistemic_disclosures: a });
    expect(computeReceiptHash({ ...receipt, epistemic_disclosures: b })).toBe(receipt.receipt_hash);
    const changed = disclosures();
    changed.defeaters![0].condition = 'Something else.';
    expect(computeReceiptHash({ ...receipt, epistemic_disclosures: changed })).not.toBe(receipt.receipt_hash);
  });

  it('rejects disclosures that claim to affect the verdict', () => {
    const bad = { ...disclosures(), affects_verdict: true };
    expect(validateEpistemicDisclosures(bad)).toContain('epistemic_disclosures.affects_verdict must be false');
    expect(() => buildReceipt({ ...baseParams, epistemic_disclosures: bad as unknown as EpistemicDisclosures })).toThrow(/affects_verdict/);
  });

  it('only allows an unable-to-verify reason on an Unable to verify verdict', () => {
    expect(validateEpistemicDisclosures(disclosures(), { verificationStatus: 'Supported' }))
      .toContain('epistemic_disclosures.unable_to_verify is only allowed when verification_status is "Unable to verify"');
  });

  it('keeps both sides of a contested field inspectable', () => {
    const d = disclosures();
    d.unable_to_verify = { reason: 'field_contested', detail: 'Disagreement.', contested_evidence_ids: ['e1'] };
    expect(validateEpistemicDisclosures(d)).toContain('epistemic_disclosures.unable_to_verify.contested_evidence_ids must list evidence on at least two sides');
  });

  it('rejects references to claims the receipt does not contain', () => {
    const d = disclosures();
    d.defeaters!.push({ claim_id: 'ghost', kind: 'rebutting', condition: 'x' });
    expect(validateEpistemicDisclosures(d, { claimIds: ['c1', 'c2', 'c3'] })).toContain('epistemic_disclosures.defeaters[2].claim_id references unknown claim ghost');
  });

  it('rejects a specificity ratio that disagrees with its counts', () => {
    const d = disclosures();
    d.informativeness!.specificity_ratio = 0.9;
    expect(validateEpistemicDisclosures(d)).toContain('epistemic_disclosures.informativeness.specificity_ratio must equal specific_claim_count / material_claim_count');
  });

  it('rejects invalid enums', () => {
    const d = disclosures() as unknown as Record<string, any>;
    d.inference.status = 'probably';
    d.defeaters[0].kind = 'vibes';
    d.precisifications[0].status_sensitive = 'maybe';
    const errors = validateEpistemicDisclosures(d);
    expect(errors).toEqual(expect.arrayContaining([
      'epistemic_disclosures.inference.status is invalid',
      'epistemic_disclosures.defeaters[0].kind is invalid',
      'epistemic_disclosures.precisifications[0].status_sensitive must be true, false, or "unknown"',
    ]));
  });
});
