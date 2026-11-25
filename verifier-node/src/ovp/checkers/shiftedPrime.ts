import { Checker } from './base';
import { finding } from './helpers';
import { sha256 } from '../core/hashing';
import { Claim, ClaimType, Evidence, Finding, VerificationContext } from '../core/models';

const SOURCE = 'https://arxiv.org/pdf/2608.19525v1#page=2';
const MAX_PRIME_CANDIDATE = 1_000_000;
const POSITIVE_INTEGER = /^[1-9][0-9]{0,29}$/;
const COEFFICIENT = /^(?:0|-?[1-9][0-9]{0,29})$/;

const THEOREM_1_3_BOUNDS = {
  1: 'O(exp(-(log log N)^c))',
  2: 'O(exp(-(log log log N)^c))',
  3: 'O((log log log N)^(-c))',
} as const;

type Theorem13Check = {
  kind: 'theorem_1_3';
  polynomial: string[];
  multipliers: string[];
  part: keyof typeof THEOREM_1_3_BOUNDS;
};

type Check =
  | Theorem13Check
  | { kind: 'theorem_1_2'; polynomials: string[][] }
  | { kind: 'nondegenerate_example'; polynomials: string[][]; p: number }
  | { kind: 'progression_witness'; polynomials: string[][]; p: number; x: string; set: string[] };

function isIntegerList(value: unknown, min: number, max: number): value is string[] {
  return Array.isArray(value) && value.length >= min && value.length <= max &&
    value.every((entry: unknown) => typeof entry === 'string' && COEFFICIENT.test(entry));
}

function parseCheck(value: unknown): Check {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Each math-paper check must be an object.');
  }
  const { kind, polynomials, p, x, set, polynomial, multipliers, part } = value as Record<string, unknown>;
  if (kind === 'theorem_1_3') {
    if (!isIntegerList(polynomial, 1, 33) || !isIntegerList(multipliers, 1, 32)) {
      throw new Error('Supply 1–33 polynomial coefficients and 1–32 multipliers as decimal integer strings of at most 30 digits.');
    }
    if (part !== 1 && part !== 2 && part !== 3) {
      throw new Error('Supply the claimed Theorem 1.3 part as 1, 2, or 3.');
    }
    return { kind, polynomial, multipliers, part };
  }
  if (kind !== 'theorem_1_2' && kind !== 'nondegenerate_example' && kind !== 'progression_witness') {
    throw new Error('Expected theorem_1_2, theorem_1_3, nondegenerate_example, or progression_witness.');
  }
  if (!Array.isArray(polynomials) || polynomials.length < 1 || polynomials.length > 32 ||
      !polynomials.every((row: unknown) => isIntegerList(row, 1, 33))) {
    throw new Error('Supply 1–32 polynomials with 1–33 decimal integer coefficient strings of at most 30 digits each.');
  }
  if (kind === 'theorem_1_2') return { kind, polynomials };
  if (typeof p !== 'number' || !Number.isInteger(p) || p < 2 || p > MAX_PRIME_CANDIDATE) {
    throw new Error(`Supply an integer p between 2 and ${MAX_PRIME_CANDIDATE}.`);
  }
  if (kind === 'nondegenerate_example') return { kind, polynomials, p };
  if (typeof x !== 'string' || !POSITIVE_INTEGER.test(x)) {
    throw new Error('Supply x as a positive decimal integer string of at most 30 digits.');
  }
  if (!Array.isArray(set) || set.length < 1 || set.length > 1000 ||
      !set.every((member: unknown) => typeof member === 'string' && POSITIVE_INTEGER.test(member))) {
    throw new Error('Supply a set of 1–1000 positive decimal integer strings of at most 30 digits each.');
  }
  return { kind, polynomials, p, x, set };
}

export function extractShiftedPrimeClaims(input: string): Claim[] {
  const checks: unknown = JSON.parse(input);
  if (!Array.isArray(checks) || checks.length < 1 || checks.length > 100) {
    throw new Error('Supply a JSON array of 1–100 math-paper checks.');
  }
  return checks.map((value, index) => {
    const check = parseCheck(value);
    let text: string;
    if (check.kind === 'theorem_1_3') {
      text = `The polynomial ${JSON.stringify(check.polynomial)} with multipliers ${JSON.stringify(check.multipliers)} meets the algebraic hypotheses of Theorem 1.3, part (${check.part}).`;
    } else {
      const family = JSON.stringify(check.polynomials);
      text = check.kind === 'theorem_1_2'
        ? `The family ${family} satisfies the polynomial hypotheses of Theorem 1.2.`
        : `The family ${family} yields pairwise distinct offsets, including zero, at the prime p=${check.p}.`;
      if (check.kind === 'progression_witness') {
        text += ` Starting at x=${check.x}, all resulting points lie in the supplied set.`;
      }
    }
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
  readonly version = '1.2.0';
  readonly supportedClaimTypes = new Set<ClaimType>(['mathematical']);

  async check(claim: Claim, context: VerificationContext): Promise<Finding[]> {
    const input = claim.metadata.shifted_prime_check;
    if (input === undefined) return [];
    const check = parseCheck(input);
    if (check.kind === 'theorem_1_3') return [this.checkTheorem13(check, claim, context)];
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
    const witness = check.kind === 'progression_witness'
      ? this.checkMembership(offsets, check.x, check.set)
      : undefined;
    const passed = prime && distinct && (witness?.all_points_in_set ?? true);
    const reasons = [];
    if (!prime) reasons.push(`p=${p} is composite.`);
    if (!distinct) reasons.push('At least two offsets coincide.');
    if (witness && !witness.all_points_in_set) reasons.push('At least one progression point is outside the supplied set.');
    const success = witness
      ? 'The parameter is prime, the offsets are distinct, and every point belongs to the supplied set.'
      : 'The parameter is prime and all offsets are distinct.';
    const report = finding(claim, context, this, passed ? 'verified' : 'contradicted',
      passed ? 'info' : 'medium', passed ? success : reasons.join(' '),
      'deterministic_check',
      { limitations: [witness
        ? 'This calculation covers the submitted witness and supplied set. The general theorem requires separate review.'
        : 'This calculation covers one parameter. It checks no set membership or asymptotic density claim.'] });
    this.addCalculation(report, JSON.stringify({ p, prime, shift: shift.toString(),
      offsets: offsets.map(String), pairwise_distinct: distinct, ...witness }), passed);
    return [report];
  }

  private checkTheorem13(check: Theorem13Check, claim: Claim, context: VerificationContext): Finding {
    const { polynomial, multipliers, part } = check;
    const length = multipliers.length + 1;
    const derivativeAtZero = polynomial[1] ?? '0';
    const failures: string[] = [];
    if (length < 3) failures.push('The progression must have at least three terms.');
    if (polynomial.every((coefficient) => coefficient === '0')) failures.push('The polynomial must be nonzero.');
    if (polynomial[0] !== '0') failures.push('The constant term must be zero.');
    if (multipliers.includes('0')) failures.push('The multipliers must be nonzero.');
    if (new Set(multipliers).size !== multipliers.length) failures.push('The multipliers must be pairwise distinct.');

    const computedPart = failures.length ? null : derivativeAtZero === '0' ? 3 : length === 3 ? 1 : 2;
    const densityBound = computedPart === null ? null : THEOREM_1_3_BOUNDS[computedPart];
    const passed = computedPart === part;
    if (computedPart !== null && !passed) {
      failures.push(`The derivative and progression length select part (${computedPart}), while the claim cites part (${part}).`);
    }
    const report = finding(claim, context, this, passed ? 'verified' : 'contradicted',
      passed ? 'info' : 'medium', passed ? `The algebraic hypotheses of part (${part}) hold.` : failures.join(' '),
      'deterministic_check',
      { limitations: ['The density bound is for sufficiently large N and sets avoiding the specified progressions with P(p−1) nonzero. This check covers only the algebraic conditions and selection of the theorem part.'] });
    const excerpt = 'Theorem 1.3 distinguishes nonzero derivative at zero with three terms or with four or more terms, and zero derivative at zero.';
    report.evidence.push({ type: 'source', locator: 'https://arxiv.org/pdf/2608.19525v1#page=3',
      supporting_excerpt: excerpt, content_hash: sha256(excerpt), relation: 'contextualizes' });
    this.addCalculation(report, JSON.stringify({ length, constant_term: polynomial[0],
      derivative_at_zero: derivativeAtZero, claimed_part: part, computed_part: computedPart,
      density_bound: densityBound }), passed);
    return report;
  }

  private checkMembership(offsets: bigint[], x: string, members: string[]) {
    const start = BigInt(x);
    const set = new Set(members);
    const points = offsets.map((offset) => (start + offset).toString());
    const missing = [...new Set(points.filter((point) => !set.has(point)))];
    return { x, points, missing_points: missing, all_points_in_set: missing.length === 0 };
  }

  private addCalculation(report: Finding, calculation: string, passed: boolean): void {
    const evidence: Evidence = { type: 'calculation', locator: `input#${report.claim_id}`,
      supporting_excerpt: calculation, content_hash: sha256(calculation),
      relation: passed ? 'supports' : 'contradicts' };
    (passed ? report.evidence : report.counterevidence).push(evidence);
  }
}
