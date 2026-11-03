# Changelog

All notable changes to MAMV are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **Breaking:** verification and write routes (`/api/verify`, `/v1/verify`, `/api/mamv/verify`, `/api/mamv/guard`, `/api/validation` writes) now require an organization API key with the matching scope or a session with the matching role. Set `ALLOW_ANONYMOUS_ACCESS=true` for local development; the quickstart mock sandbox does this automatically.
- `GET /api/jobs/:id/trace` requires `receipts:read`, returns only the caller's own traces, and is disabled in production unless `DEBUG_TRACES_ENABLED=true`.
- The requester identity comes from credentials; `x-requester-id` is ignored. `Idempotency-Key` values are scoped per organization.
- Production startup fails without a 32+ character `JWT_SECRET` or an explicit `CORS_ORIGIN` allowlist. JWTs are verified as HS256 only, and a wildcard CORS origin never carries credentials.

### Added

- Open-source contribution, issue, pull-request, branch-protection, and release-process documentation.

### Fixed

- `package-lock.json` is back in sync with the workspaces, so `npm ci` works again.
- API decision gate and MAMV verifier imports now resolve: the leftover `mmv*` service modules are renamed to `mamv*`.
- Shared schema validation now gets Ajv 8 instead of the hoisted Ajv 6, so validation error paths are reported correctly.
- `WebhookService.verifySignature` returns `false` for a malformed signature instead of throwing. A webhook's `failureCount` now counts each failed delivery once, not once per retry attempt.
- The API Jest suite runs again: hoisted `@types` resolve, the real `prom-client` is used, and stale tests now match the current APIs.
- Claim-extraction confidence callers use `process_confidence`.

## [0.1.0] - 2026-07-19

### Added

- Initial public MAMV release.

[Unreleased]: https://github.com/michaelmannen3-oss/MAMV/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/michaelmannen3-oss/MAMV/releases/tag/v0.1.0
