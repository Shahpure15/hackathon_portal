# Changelog

Format: Keep a Changelog. Versioning: Semantic Versioning (see docs/VERSIONING.md). Every entry ends with its change ID.

## [Unreleased]
### Added
- Backend pytest harness with a SQLite safety guard, route-guard, migration, error-handling and version tests. [P0-C03]
- GitHub Actions CI: backend tests, version check, frontend build. [P0-C03]

### Security
- 500 responses no longer include exception text; details remain in server logs only. [P0-C02]

## [10.0.0] - 2026-10-10
### Baseline
- Version surfaces unified at 10.0.0: VERSION file, backend config, frontend package, lockfile, version.js. [P0-C01]
- History before this entry is not reconstructed. See backend/docs/V9_1_INCIDENTS_AND_ARGON2_ARCHIVE.md for the 9.1.0 to 10.0.0 password hashing migration (Argon2id to bcrypt), the CORS fix and the WebSocket reconnect fix.
