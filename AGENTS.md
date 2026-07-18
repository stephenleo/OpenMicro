# OpenMicro — project conventions

## Releases

- **Release inside the parent PR**: when a fix/feature PR is going to ship as a release, push the version bump (`npm version X.Y.Z --no-git-tag-version`) and CHANGELOG entry as a commit on that same PR — do not open a separate release PR. After the parent PR merges, tag `vX.Y.Z` on main and push the tag; the publish workflow handles npm.
- Verification gate before any release commit: `npm run typecheck && npm run lint && npm run format:check && npm test`.
