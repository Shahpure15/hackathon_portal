# Changelog

Format: Keep a Changelog. Versioning: Semantic Versioning (see docs/VERSIONING.md). Every entry ends with its change ID.

## [Unreleased]
### Added
- Leaderboard, results release, progression and leaderboard export endpoints. [P4-C04]
- Ranking, progression and results release services with snapshot and diff semantics. [P4-C03]
- Progression status, result release snapshot and notification tables. [P4-C02]

## [10.5.0] - 2026-10-11
### Added
- Shared scoring vectors checked on both backend and frontend in CI. [P3-C09]
- Accept-invite page; Email module; Judging tab with assignment wizard, progress console and rubric revise; judge console. [P3-C08]
- Judge API: assigned rounds and teams, draft autosave, locking submit; per-user rate limits. [P3-C07]
- SMTP account and template management, staff invitations by email, public accept-invite flow. [P3-C06]
- Assignment planner, preview-and-commit assignment API with manual precedence, progress, trail, unlock, comment hiding and rubric revise endpoints. [P3-C05]
- Evaluation service: drafts, locking submit, unlock versions, rubric revise. [P3-C04]
- Evaluation tables: assignments, evaluations, versions, scores, texts. [P3-C03]
- Email core: encrypted SMTP accounts, sandboxed templates, durable outbox and worker, one-time auth tokens. [P3-C02]

## [10.4.0] - 2026-10-11
### Added
- Rounds admin module with judging toggle and rubric editor. [P2-C06]
- Rounds API with rubric editing and publishing. [P2-C05]
- Rubric service with versioning, publish and lock rules. [P2-C04]
- Pure scoring engine: judge totals, aggregation, ranking, display scale, rubric validation. [P2-C03]
- Unified round columns and rubric_versions/rubric_fields tables. [P2-C02]

### Changed
- Leader round list and submission ignore rounds with submissions disabled. [P2-C05]

## [10.3.0] - 2026-10-11
### Added
- Roles & Access admin module: permission editor, member scopes, templates, event feature toggles. [P1b-C03]
- Roles, templates, scoped member assignments and event feature flags (admin API). [P1b-C02]

### Changed
- Staff screen shows modules and controls according to the signed-in role's permissions; pod shown as a label only. [P1b-C04]

## [10.2.0] - 2026-10-11
### Added
- Frontend permission context (can, canAny, features) and permission-filtered navigation. [P1-C10]
- Permission usage and role-by-route parity tests. [P1-C09]
- GET /auth/me returning the caller's permissions, scope, features and module gates. [P1-C08]
- RBAC core: Principal, require_permission, require_principal, team scope filter, 15-second access cache. [P1-C05]
- RBAC tables (roles, role_permissions, role_templates, user_role_assignments) with seeded Volunteer and Judge roles and backfilled volunteer assignments. [P1-C04]
- Permission catalog (46 keys) with tiers, implications and scopable flags. [P1-C03]
- Test factories for events, users, volunteers, teams and auth headers. [P1-C02]

### Changed
- Admin routes use permission guards (behaviour unchanged: ADMIN holds every permission). [P1-C07]
- Volunteer routes use permission guards (behaviour unchanged for seeded roles). [P1-C06]

### Security
- Users with status 'disabled' are rejected at authentication. [P1-C05]

## [10.1.0] - 2026-10-11
### Added
- Admin UI version badge showing app and API versions with a mismatch warning. [P0-C06]
- GET /admin/system/info (admin only): app version, Alembic schema revision, commit, environment. [P0-C05]
- organizations table with a seeded default organization; events.orgId (nullable, backfilled). [P0-C04]
- event_configs.features (JSON feature flags; defaults applied in code and backfilled). [P0-C04]
- users.status (default 'active'), volunteers.email (nullable), audit_logs.eventId (nullable, indexed). [P0-C04]
- app/services package with features and tenancy helpers. [P0-C04]
- Backend pytest harness with a SQLite safety guard, route-guard, migration, error-handling and version tests. [P0-C03]
- GitHub Actions CI: backend tests, version check, frontend build. [P0-C03]

### Changed
- log_audit accepts an optional event_id; existing callers unchanged. [P0-C04]

### Security
- CORS: removed the blanket *.vercel.app trust; origins are an explicit allowlist plus *.mitindia.com, localhost only outside production, and an optional team-scoped preview regex (CORS_ALLOWED_ORIGIN_REGEX). [P0-C08]
- CORS headers on 429 and 500 responses are added only for allowed origins; the wildcard fallback is gone. [P0-C08]
- 500 responses no longer include exception text; details remain in server logs only. [P0-C02]

## [10.0.0] - 2026-10-10
### Baseline
- Version surfaces unified at 10.0.0: VERSION file, backend config, frontend package, lockfile, version.js. [P0-C01]
- History before this entry is not reconstructed. See backend/docs/V9_1_INCIDENTS_AND_ARGON2_ARCHIVE.md for the 9.1.0 to 10.0.0 password hashing migration (Argon2id to bcrypt), the CORS fix and the WebSocket reconnect fix.
