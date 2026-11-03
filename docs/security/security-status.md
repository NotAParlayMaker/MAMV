# Security Status Matrix

| Feature | Status | Code Reference | Notes |
| --- | --- | --- | --- |
| Commit–reveal evaluator workflow | Implemented | `contracts/VerificationMarketplace.sol` | Commit/reveal for evaluator scores. |
| Evidence bundle hashing | Implemented | `verifier-node/src/evidence/evidenceBundlerV2.ts` | Hashes evidence bundles and commits. |
| Evidence hash + URI commitments | Implemented | `contracts/BundleRegistry.sol`, `contracts/DisputeLadder.sol` | Enforced during disputes. |
| Dispute ladder (L0–L3) | Implemented | `contracts/DisputeLadder.sol` | Multi-round appealable ladder. |
| Dispute response window | Implemented | `contracts/DisputeLadder.sol` | Verifier response deadline + default resolution. |
| Appeal bonds & windows | Implemented | `contracts/DisputeLadder.sol` | Configurable per round. |
| Juror rewards & treasury cut | Implemented | `contracts/DisputeLadder.sol` | Bond split between winner, jurors, treasury. |
| VRF auditor selection | Partial | `contracts/DisputeLadder.sol` | Chainlink VRF supported; deterministic fallback for tests. |
| Auditor staking & reputation | Implemented | `contracts/AuditorRegistry.sol` | Stake + reputation updates. |
| Program hashing | Implemented | `shared/programs.ts`, `programs/registry.ts` | Deterministic program hash checks. |
| Schema validation (bundles/receipts) | Implemented | `shared/schemas/*`, `programs/registry.ts` | AJV validation. |
| Rate limits | Partial | `api/` | Per-IP limits; not yet per API key, and not every `/v1` route is covered. |
| Authenticated verification/write routes | Implemented | `api/src/middleware/security.ts` | API key scope or session role required; anonymous only via `ALLOW_ANONYMOUS_ACCESS` outside production or in a fully mocked sandbox. |
| Credential-derived requester identity | Implemented | `api/src/middleware/security.ts` | `x-requester-id` is ignored. |
| Tenant-scoped debug traces and idempotency | Implemented | `api/src/routes/jobs.ts`, `api/src/services/idempotency.ts` | Traces disabled in production by default. |
| Startup security config checks | Implemented | `api/src/server.ts` | Production refuses to start without a 32+ char `JWT_SECRET` and an explicit `CORS_ORIGIN` allowlist. |
| WebSocket authentication | Planned | `api/src/services/websocket.ts` | Subscriptions are not yet authenticated or ownership-checked. |
| Optional TEE attestations | Planned | `docs/security/threat-model.md` | No on-chain enforcement yet. |
| ZK proofs for verification | Planned | `shared/types.ts` | ZK proof attachments supported in schema only. |

