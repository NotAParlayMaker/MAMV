import { Checker } from './base';
import { finding } from './helpers';
import { sha256 } from '../core/hashing';
import { Claim, ClaimType, Evidence, Finding, VerificationContext } from '../core/models';

const SOURCE = 'https://arxiv.org/pdf/2608.19525v1#page=2';
const MAX_PRIME_CANDIDATE = 1_000_000;
const COEFFICIENT = /^(?:0|-?[1-9][0-9]{0,29})$/;

type Check =
  | { kind: 'theorem_1_2'; polynomials: string[][] }
  | { kind: 'nondegenerate_example'; polynomials: string[][]; p: number };

function parseCheck(value: unknown): Check {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Each math-paper check must be an object.');
  }
  const { kind, polynomials, p } = value as { kind?: unknown; polynomials?: unknown; p?: unknown };
  if (kind !== 'theorem_1_2' && kind !== 'nondegenerate_example') {
    throw new Error('Expected theorem_1_2 or nondegenerate_example.');
  }
  if (!Array.isArray(polynomials) || polynomials.length < 1 || polynomials.length > 32 ||
      !polynomials.every((row: unknown) => Array.isArray(row) && row.length >= 1 &&
        row.length <= 33 && row.every((coefficient: unknown) =>
          typeof coefficient === 'string' && COEFFICIENT.test(coefficient)))) {
    throw new Error('Supply 1–32 polynomials with 1–33 decimal integer coefficient strings of at most 30 digits each.');
  }
  if (kind === 'theorem_1_2') return { kind, polynomials };
  if (typeof p !== 'number' || !Number.isInteger(p) || p < 2 || p > MAX_PRIME_CANDIDATE) {
    throw new Error(`Supply an integer p between 2 and ${MAX_PRIME_CANDIDATE}.`);
  }
  return { kind, polynomials, p };
}

export function extractShiftedPrimeClaims(input: string): Claim[] {
  const checks: unknown = JSON.parse(input);
  if (!Array.isArray(checks) || checks.length < 1 || checks.length > 100) {
    throw new Error('Supply a JSON array of 1–100 math-paper checks.');
  }
  return checks.map((value, index) => {
    const check = parseCheck(value);
    const family = JSON.stringify(check.polynomials);
    const text = check.kind === 'theorem_1_2'
      ? `The family ${family} satisfies the polynomial hypotheses of Theorem 1.2.`
      : `The family ${family} yields pairwise distinct offsets, including zero, at the prime p=${check.p}.`;
    return {
      claim_id: `math-${index + 1}`, text, source_span: { start: 0, end: input.length },
      context: 'Generated from structured shifted-prime check input.',
      claim_type: 'mathematical', dependencies: [], metadata: { shifted_prime_check: check },
    };
  });
}

function isPrime(value: number): boolean {
  for (let divisor = 2; divisor * divisor <= value; divisor++) {
    if (value % divisor === 0) return false;
  }
  return true;
}

export class ShiftedPrimeChecker implements Checker {
  readonly name = 'shifted_prime';
  readonly version = '1.0.0';
  readonly supportedClaimTypes = new Set<ClaimType>(['mathematical']);

  async check(claim: Claim, context: VerificationContext): Promise<Finding[]> {
    const input = claim.metadata.shifted_prime_check;
    if (input === undefined) return [];
    const check = parseCheck(input);
    const polynomials = check.polynomials.map((row) => row.map((coefficient) => BigInt(coefficient)));

    if (check.kind === 'theorem_1_2') {
      const degrees = polynomials.map((row) => row.reduce((degree, coefficient, index) => coefficient === 0n ? degree : index, -1));
      const constants = polynomials.map((row) => row[0].toString());
      const failures: string[] = [];
      if (degrees.some((degree) => degree < 1)) failures.push('Each polynomial must be nonconstant.');
      if (constants.some((constant) => constant !== '0')) failures.push('Each constant term must be zero.');
      if (new Set(degrees).size !== degrees.length) failures.push('The degrees must be pairwise distinct.');
      const report = finding(claim, context, this, failures.length ? 'contradicted' : 'verified',
        failures.length ? 'medium' : 'info',
        failures.length ? failures.join(' ') : 'All checked polynomial hypotheses hold.',
        'deterministic_check',
        { limitations: ['This finding covers the polynomial family. Full applicability also requires the theorem’s sufficiently large N and avoidance hypotheses, including its pairwise distinct offset condition.'] });
      const excerpt = 'Theorem 1.2 assumes fixed nonconstant integer polynomials with distinct degrees and zero constant term.';
      report.evidence.push({ type: 'source', locator: SOURCE, supporting_excerpt: excerpt,
        content_hash: sha256(excerpt), relation: 'contextualizes' });
      this.addCalculation(report, JSON.stringify({ degrees, constant_terms: constants }), failures.length === 0);
      return [report];
    }

    const { p } = check;
    const shift = BigInt(p - 1);
    const offsets = [0n, ...polynomials.map((row) =>
      row.reduceRight((value, coefficient) => value * shift + coefficient, 0n))];
    const prime = isPrime(p);
    const distinct = new Set(offsets).size === offsets.length;
    const passed = prime && distinct;
    const reasons = [];
    if (!prime) reasons.push(`p=${p} is composite.`);
    if (!distinct) reasons.push('At least two offsets coincide.');
    const report = finding(claim, context, this, passed ? 'verified' : 'contradicted',
      passed ? 'info' : 'medium', passed ? 'The parameter is prime and all offsets are distinct.' : reasons.join(' '),
      'deterministic_check',
      { limitations: ['This calculation covers one parameter. It checks no set membership or asymptotic density claim.'] });
    this.addCalculation(report, JSON.stringify({ p, prime, shift: shift.toString(),
      offsets: offsets.map(String), pairwise_distinct: distinct }), passed);
    return [report];
  }

  private addCalculation(report: Finding, calculation: string, passed: boolean): void {
    const evidence: Evidence = { type: 'calculation', locator: `input#${report.claim_id}`,
      supporting_excerpt: calculation, content_hash: sha256(calculation),
      relation: passed ? 'supports' : 'contradicts' };
    (passed ? report.evidence : report.counterevidence).push(evidence);
  }
}
