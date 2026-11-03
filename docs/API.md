# MAMV API

## Authentication

Routes that spend provider credits, sign, or write state require
`Authorization: Bearer mamv_...` (an organization API key) or an organization
session JWT (HS256 only):

| Route | API key scope | Session permission |
| --- | --- | --- |
| `POST /api/verify`, `POST /v1/verify` | `verifications:create` | `createVerification` |
| `POST /api/mamv/verify`, `POST /api/mamv/guard` | `verifications:create` | `createVerification` |
| `POST /api/validation/requests` | `verifications:create` | `createVerification` |
| `POST /api/validation/requests/:id/results` | `receipts:write` | `writeReceipts` |
| `GET /api/jobs/:id/trace` | `receipts:read` | `readResources` |

Missing credentials return 401; a missing scope or permission returns 403.
The requester identity used for decision gates and validation records is
derived from those credentials; `x-requester-id` is ignored. `Idempotency-Key`
values are scoped to the calling organization. Debug traces are returned only
to the organization that created them and are disabled in production unless
`DEBUG_TRACES_ENABLED=true`.

For local development, `ALLOW_ANONYMOUS_ACCESS=true` lets unauthenticated
callers through. It is ignored under `NODE_ENV=production` unless both
`MOCK_VERIFIER` and `MOCK_CHAIN` are `true` (the quickstart mock sandbox).

## Create a verification receipt

`POST /api/mamv/verify`

```json
{
  "taskId": "demo-1",
  "input": "Question or prompt",
  "candidates": ["AI answer to check"],
  "evidence": { "sources": ["https://example.com/source"] }
}
```

Response:

```json
{ "taskId": "demo-1", "receipt": { "receipt_id": "0x...", "verification_status": "Mostly supported" } }
```

## Fetch a receipt

`GET /api/jobs/{jobId}/receipt` returns a receipt in mock/demo mode. Production deployments can expose the same receipt shape from their receipt store.

## Verify a receipt hash/signature

Use `packages/receipt-verifier` to recompute the canonical hash and validate signatures with independently trusted verifier keys. API deployments may expose this as `POST /api/mamv/receipts/verify`.

## Optional anchoring

If anchoring is enabled, use an anchor endpoint to submit `receipt_hash`, then poll anchor status. Anchoring is for tamper-evident accountability and does not prove answer correctness.

```json
{ "receipt_hash": "0x...", "anchor_status": "anchored", "tx_hash": "0x..." }
```
