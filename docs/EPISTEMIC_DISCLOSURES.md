# Epistemic disclosures

A verdict says what the reviewed evidence supports. It does not say whether the
answer said anything worth checking, whether its conclusion follows from its
claims, why a gap exists, what would overturn the assessment, or how a vague
term was read. `epistemic_disclosures` records those five things beside the
verdict.

**Disclosures never change the verdict.** `verdictFromEvidence` takes no
disclosure input, the envelope carries the invariant `affects_verdict: false`,
and validation rejects any other value. Changing that would alter verdict policy
semantics and requires a separate, reviewed decision (see `AGENTS.md`).

Implementation: `shared/epistemicDisclosures.ts`. Schema:
`epistemic_disclosures` in `shared/schemas/receipt.v1.schema.json`. The field is
optional and, when present, bound into the receipt hash with set-like arrays
sorted. Receipts without it hash exactly as before.

## 1. Informativeness

A vague answer ("some experts have discussed this") can meet the support
thresholds more easily than a specific, testable one. Left unreported, the
verdict rewards saying less.

`informativeness` reports counts: material claims, claims the verifier
**declares** specific under a named `method` (a checkable quantity, date,
entity, condition, or comparison), and claims the pragmatics layer marked
`hedged_content`. `specificity_ratio = specific_claim_count /
material_claim_count` (0 when there are none); validation checks that the ratio
matches the counts. `summarizeInformativeness` computes this from receipt claims.

Limitations: specificity is declared by the verifier, never inferred from
length, fluency, confidence of phrasing, or latency. The ratio is not a quality
score, not a probability, and not combined with the verdict. `limitations` is
required.

## 2. Inference and omission

Every claim can be supported while the answer as a whole still misleads.

- `inference` names the conclusion claim(s), the premise claim(s), and whether
  the conclusion `follows`, `partially_follows`, `does_not_follow`, or was
  `not_assessed`, with a concise inspectable `basis` (never hidden
  chain-of-thought).
- `omissions` lists reviewed evidence bearing on a material claim that the
  answer did not mention, with its materiality.

These are findings about the answer's argument, not new evidentiary verdicts.

## 3. Why "Unable to verify"

**Unable to verify** covers situations with very different meanings. When the
verdict is Unable to verify, `unable_to_verify.reason` says which:

| Reason | What it is a fact about |
| --- | --- |
| `verifier_limited` | The verifier: access, capability, or authority was lacking. |
| `evidence_absent` | The evidence record: nothing relevant was found. |
| `field_contested` | The field: qualified sources disagree and the question is open. |
| `out_of_scope_domain` | The claim domain: normative, predictive, or aesthetic claims are outside evidentiary scoring. |

`field_contested` requires `contested_evidence_ids` with at least two entries so
both sides stay inspectable rather than being averaged away. A reason is only
valid when `verification_status` is **Unable to verify**.

## 4. Defeaters

An assessment is defeasible. `defeaters` records, per claim, what would require
a new linked assessment:

- `rebutting`: evidence against the claim itself (a larger trial finds no effect).
- `undercutting`: evidence against the link between evidence and claim (the
  cited study is retracted; two "independent" sources share an origin).

`watched_evidence_ids` names evidence whose change triggers the condition. A
triggered defeater creates a new linked assessment; it never rewrites the
historical receipt.

## 5. Precisifications

Whether "most", "significant", "recently", or "safe" is supported depends on how
the term is read. `precisifications` records the `reading` assessed, any
`alternatives_considered`, and whether a different reasonable reading could
change the claim's status (`status_sensitive`: `true`, `false`, or `"unknown"`).
This complements the genericity assessment, which detects generic and
quantified statements; precisifications record the reading actually used.

## What disclosures are not

- Not evidence, and not independent support.
- Not inputs to `verdictFromEvidence`, confidence, or score.
- Not claims about model cognition. They describe the answer, the evidence, and
  the verification process.
