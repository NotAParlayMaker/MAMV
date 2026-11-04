/**
 * Epistemic disclosures: optional, inspectable records about *how* a verdict
 * was reached and *where it could fail*. They never change the verdict.
 *
 * They answer five questions the verdict alone cannot:
 *  1. Informativeness — did the answer say anything testable, or did it hedge
 *     its way to a favourable verdict?
 *  2. Inference and omission — does the answer's conclusion follow from its
 *     supported claims, and did it leave out material counter-evidence?
 *  3. Unable-to-verify reason — is the gap the verifier's, the world's, or an
 *     open question among qualified sources?
 *  4. Defeaters — what evidence would overturn this assessment?
 *  5. Precisifications — which reading of a vague term was assessed?
 *
 * See docs/EPISTEMIC_DISCLOSURES.md.
 */
import type { Verdict } from './verdicts';

export const EPISTEMIC_DISCLOSURES_VERSION = 'epistemic-disclosures/v1' as const;

/* 1. Informativeness ------------------------------------------------------ */

/**
 * Counts, not a quality score. A claim is "specific" only when the verifier
 * declares it states a checkable quantity, date, entity, condition, or
 * comparison. Length, fluency, and confidence of phrasing are never inputs.
 */
export interface InformativenessAssessment {
  /** Declared method used to classify specific claims. */
  method: string;
  material_claim_count: number;
  specific_claim_count: number;
  hedged_claim_count: number;
  /** specific_claim_count / material_claim_count, or 0 when there are none. */
  specificity_ratio: number;
  specific_claim_ids: string[];
  limitations: string[];
}

/* 2. Inference and omission ---------------------------------------------- */

export const INFERENCE_STATUSES = ['follows', 'partially_follows', 'does_not_follow', 'not_assessed'] as const;
export type InferenceStatus = (typeof INFERENCE_STATUSES)[number];

/**
 * Whether the answer's conclusion is warranted by its premises. Supported
 * premises do not by themselves make a supported conclusion.
 */
export interface InferenceAssessment {
  conclusion_claim_ids: string[];
  premise_claim_ids: string[];
  status: InferenceStatus;
  /** Concise inspectable basis; never hidden chain-of-thought. */
  basis: string;
}

/** Reviewed evidence bearing on a material claim that the answer did not mention. */
export interface OmissionFinding {
  evidence_id: string;
  affected_claim_ids: string[];
  materiality: 'material' | 'minor';
  description: string;
}

/* 3. Why "Unable to verify" ---------------------------------------------- */

export const UNABLE_TO_VERIFY_REASONS = [
  /** The verifier lacked access, capability, or authority. A fact about us. */
  'verifier_limited',
  /** No relevant evidence could be found. A fact about the evidence record. */
  'evidence_absent',
  /** Qualified sources disagree and the question is open. A fact about the field. */
  'field_contested',
  /** The claim domain (normative, predictive, aesthetic) is outside evidentiary scoring. */
  'out_of_scope_domain',
] as const;
export type UnableToVerifyReason = (typeof UNABLE_TO_VERIFY_REASONS)[number];

export interface UnableToVerifyDisclosure {
  reason: UnableToVerifyReason;
  detail: string;
  /**
   * For `field_contested`: the evidence on each side. At least two entries, so
   * the disagreement itself stays inspectable rather than summarised away.
   */
  contested_evidence_ids?: string[];
}

/* 4. Defeaters ------------------------------------------------------------ */

/**
 * Rebutting defeaters are evidence against the claim itself; undercutting
 * defeaters attack the link between the evidence and the claim (for example,
 * a retraction, or a showing that two "independent" sources share an origin).
 */
export const DEFEATER_KINDS = ['rebutting', 'undercutting'] as const;
export type DefeaterKind = (typeof DEFEATER_KINDS)[number];

export interface Defeater {
  claim_id: string;
  kind: DefeaterKind;
  /** The condition that, if observed, requires a new linked assessment. */
  condition: string;
  /** Evidence whose change or retraction would trigger the condition. */
  watched_evidence_ids?: string[];
}

/* 5. Precisifications ---------------------------------------------------- */

/** The reading of a vague or context-sensitive term that was actually assessed. */
export interface Precisification {
  claim_id: string;
  term: string;
  reading: string;
  alternatives_considered?: string[];
  /** Whether a different reasonable reading could change the claim's status. */
  status_sensitive: boolean | 'unknown';
}

/* Envelope --------------------------------------------------------------- */

export interface EpistemicDisclosures {
  version: typeof EPISTEMIC_DISCLOSURES_VERSION;
  /** Invariant: disclosures are reported beside the verdict, never inside it. */
  affects_verdict: false;
  informativeness?: InformativenessAssessment;
  inference?: InferenceAssessment;
  omissions?: OmissionFinding[];
  unable_to_verify?: UnableToVerifyDisclosure;
  defeaters?: Defeater[];
  precisifications?: Precisification[];
}

type ClaimLike = { id: string; materiality_weight?: number; content_role?: string };

/**
 * Builds an informativeness assessment from receipt claims and the claim IDs a
 * verifier declared specific under `method`. Material claims are those with a
 * positive materiality weight (or no weight recorded). Hedged claims are those
 * the pragmatics layer marked `hedged_content`.
 */
export function summarizeInformativeness(
  claims: ClaimLike[],
  specificClaimIds: string[],
  method: string,
  limitations: string[],
): InformativenessAssessment {
  const material = claims.filter((claim) => claim.materiality_weight === undefined || claim.materiality_weight > 0);
  const materialIds = new Set(material.map((claim) => claim.id));
  const specific = [...new Set(specificClaimIds)].filter((id) => materialIds.has(id)).sort();
  const hedged = material.filter((claim) => claim.content_role === 'hedged_content').length;
  return {
    method,
    material_claim_count: material.length,
    specific_claim_count: specific.length,
    hedged_claim_count: hedged,
    specificity_ratio: material.length ? specific.length / material.length : 0,
    specific_claim_ids: specific,
    limitations,
  };
}

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * Structural validation. `context` lets references be checked against the
 * receipt's own claims and the verdict it reports.
 */
export function validateEpistemicDisclosures(
  value: unknown,
  context: { claimIds?: string[]; verificationStatus?: Verdict } = {},
): string[] {
  const errors: string[] = [];
  const p = 'epistemic_disclosures';
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${p} must be an object`];
  const d = value as Record<string, unknown>;
  if (d.version !== EPISTEMIC_DISCLOSURES_VERSION) errors.push(`${p}.version is unsupported`);
  if (d.affects_verdict !== false) errors.push(`${p}.affects_verdict must be false`);

  const known = context.claimIds ? new Set(context.claimIds) : null;
  const checkClaimIds = (ids: unknown, path: string) => {
    if (!stringArray(ids)) { errors.push(`${path} must be an array of claim ids`); return; }
    if (known) for (const id of ids) if (!known.has(id)) errors.push(`${path} references unknown claim ${id}`);
  };

  if (d.informativeness !== undefined) {
    const i = d.informativeness as Record<string, unknown>;
    const path = `${p}.informativeness`;
    if (!nonEmpty(i.method)) errors.push(`${path}.method is required`);
    for (const field of ['material_claim_count', 'specific_claim_count', 'hedged_claim_count']) {
      const n = i[field];
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) errors.push(`${path}.${field} must be a non-negative integer`);
    }
    const material = i.material_claim_count as number;
    const specific = i.specific_claim_count as number;
    if (typeof specific === 'number' && typeof material === 'number' && specific > material) errors.push(`${path}.specific_claim_count cannot exceed material_claim_count`);
    const expected = material > 0 ? specific / material : 0;
    if (typeof i.specificity_ratio !== 'number' || Math.abs(i.specificity_ratio - expected) > 1e-9) errors.push(`${path}.specificity_ratio must equal specific_claim_count / material_claim_count`);
    checkClaimIds(i.specific_claim_ids, `${path}.specific_claim_ids`);
    if (stringArray(i.specific_claim_ids) && i.specific_claim_ids.length !== specific) errors.push(`${path}.specific_claim_ids must list specific_claim_count claims`);
    if (!stringArray(i.limitations) || !i.limitations.length) errors.push(`${path}.limitations must not be empty`);
  }

  if (d.inference !== undefined) {
    const inf = d.inference as Record<string, unknown>;
    const path = `${p}.inference`;
    if (!INFERENCE_STATUSES.includes(inf.status as InferenceStatus)) errors.push(`${path}.status is invalid`);
    checkClaimIds(inf.conclusion_claim_ids, `${path}.conclusion_claim_ids`);
    checkClaimIds(inf.premise_claim_ids, `${path}.premise_claim_ids`);
    if (inf.status !== 'not_assessed' && stringArray(inf.conclusion_claim_ids) && !inf.conclusion_claim_ids.length) errors.push(`${path}.conclusion_claim_ids must not be empty when assessed`);
    if (!nonEmpty(inf.basis)) errors.push(`${path}.basis is required`);
  }

  if (d.omissions !== undefined) {
    if (!Array.isArray(d.omissions)) errors.push(`${p}.omissions must be an array`);
    else d.omissions.forEach((o: Record<string, unknown>, index) => {
      const path = `${p}.omissions[${index}]`;
      if (!nonEmpty(o?.evidence_id)) errors.push(`${path}.evidence_id is required`);
      checkClaimIds(o?.affected_claim_ids, `${path}.affected_claim_ids`);
      if (o?.materiality !== 'material' && o?.materiality !== 'minor') errors.push(`${path}.materiality is invalid`);
      if (!nonEmpty(o?.description)) errors.push(`${path}.description is required`);
    });
  }

  if (d.unable_to_verify !== undefined) {
    const u = d.unable_to_verify as Record<string, unknown>;
    const path = `${p}.unable_to_verify`;
    if (!UNABLE_TO_VERIFY_REASONS.includes(u.reason as UnableToVerifyReason)) errors.push(`${path}.reason is invalid`);
    if (!nonEmpty(u.detail)) errors.push(`${path}.detail is required`);
    if (context.verificationStatus !== undefined && context.verificationStatus !== 'Unable to verify') errors.push(`${path} is only allowed when verification_status is "Unable to verify"`);
    if (u.reason === 'field_contested' && (!stringArray(u.contested_evidence_ids) || u.contested_evidence_ids.length < 2)) errors.push(`${path}.contested_evidence_ids must list evidence on at least two sides`);
  }

  if (d.defeaters !== undefined) {
    if (!Array.isArray(d.defeaters)) errors.push(`${p}.defeaters must be an array`);
    else d.defeaters.forEach((def: Record<string, unknown>, index) => {
      const path = `${p}.defeaters[${index}]`;
      checkClaimIds([def?.claim_id], `${path}.claim_id`);
      if (!DEFEATER_KINDS.includes(def?.kind as DefeaterKind)) errors.push(`${path}.kind is invalid`);
      if (!nonEmpty(def?.condition)) errors.push(`${path}.condition is required`);
      if (def?.watched_evidence_ids !== undefined && !stringArray(def.watched_evidence_ids)) errors.push(`${path}.watched_evidence_ids must be strings`);
    });
  }

  if (d.precisifications !== undefined) {
    if (!Array.isArray(d.precisifications)) errors.push(`${p}.precisifications must be an array`);
    else d.precisifications.forEach((pr: Record<string, unknown>, index) => {
      const path = `${p}.precisifications[${index}]`;
      checkClaimIds([pr?.claim_id], `${path}.claim_id`);
      if (!nonEmpty(pr?.term)) errors.push(`${path}.term is required`);
      if (!nonEmpty(pr?.reading)) errors.push(`${path}.reading is required`);
      if (pr?.status_sensitive !== true && pr?.status_sensitive !== false && pr?.status_sensitive !== 'unknown') errors.push(`${path}.status_sensitive must be true, false, or "unknown"`);
    });
  }

  return errors;
}

/** Stable ordering for receipt hashing; set-like arrays are sorted. */
export function normalizeEpistemicDisclosuresForHash(d: EpistemicDisclosures): EpistemicDisclosures {
  const byKey = <T>(items: T[] | undefined, key: (item: T) => string) => items ? [...items].sort((a, b) => key(a).localeCompare(key(b))) : undefined;
  const sorted = (items: string[] | undefined) => items ? [...items].sort() : undefined;
  return {
    ...d,
    informativeness: d.informativeness && { ...d.informativeness, specific_claim_ids: [...d.informativeness.specific_claim_ids].sort() },
    inference: d.inference && { ...d.inference, conclusion_claim_ids: [...d.inference.conclusion_claim_ids].sort(), premise_claim_ids: [...d.inference.premise_claim_ids].sort() },
    omissions: byKey(d.omissions?.map((o) => ({ ...o, affected_claim_ids: [...o.affected_claim_ids].sort() })), (o) => `${o.evidence_id}|${o.affected_claim_ids.join(',')}`),
    unable_to_verify: d.unable_to_verify && { ...d.unable_to_verify, contested_evidence_ids: sorted(d.unable_to_verify.contested_evidence_ids) },
    defeaters: byKey(d.defeaters?.map((x) => ({ ...x, watched_evidence_ids: sorted(x.watched_evidence_ids) })), (x) => `${x.claim_id}|${x.kind}|${x.condition}`),
    precisifications: byKey(d.precisifications?.map((x) => ({ ...x, alternatives_considered: sorted(x.alternatives_considered) })), (x) => `${x.claim_id}|${x.term}`),
  };
}
