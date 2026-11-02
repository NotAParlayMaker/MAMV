# Changelog

All notable changes to MAMV are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
