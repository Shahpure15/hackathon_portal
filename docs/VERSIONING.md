# Versioning and release protocol

What the repo said on 10 Oct 2026: backend/app/config.py BACKEND_VERSION was 10.0.0 on master and 9.0.0 on stable-prod; frontend/package.json and frontend/src/version.js were 9.0.0 on both. APP_VERSION was defined but unused; /health returned BACKEND_VERSION. No VERSION file, CHANGELOG, tags or CI existed. Decision: baseline is 10.0.0 (the highest declared number, and the documented target of the bcrypt migration). We never go backwards.

Rules
• Scheme: Semantic Versioning MAJOR.MINOR.PATCH. MAJOR: breaking change for an existing client or stored data (this program has exactly one, 11.0.0). MINOR: new backward-compatible capability (every phase, because we expand, migrate, then contract). PATCH: fixes only; hotfixes are 10.N.1 branched from the release tag.
• Single source of truth: root file VERSION. Mirrors: frontend/package.json, frontend/package-lock.json (two fields), frontend/src/version.js, backend/app/config.py. Only scripts/bump_version.py edits them. scripts/check_versions.py verifies them and runs in CI.
• Versions move once per release, at the end of a phase. Never per change.
• Per change: a change ID P<phase>-C<nn>, exactly one CHANGELOG entry under [Unreleased] ending with that ID, exactly one commit.
• Branches and tags: one branch per phase feat/v10.N-<slug>; merge to master with --no-ff; fast-forward stable-prod only after the phase gate passes; annotated tag v10.N.0 on the stable-prod commit. Schema version is the Alembic revision, visible at /admin/system/info.
• Successful change means: every verification command for it passed, nothing outside its file list changed (git status checked), and the report was written.
