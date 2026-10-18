# Feature delivery workflow

For every requested feature or fix, create a `feature/<descriptive-name>` branch from the latest `master` before editing. Complete implementation and required checks on that branch, commit and push the feature branch, then merge it into `master` and push `master`. Preserve unrelated work and remote commits; never force-push. Report the delivered commit and any checks or deployment status that remain unverified.

Pushing changes to `master` triggers the configured GitHub webhook, which redeploys the application on the user's server. Treat pushing `master` as the deployment trigger: complete the required checks before merging and pushing. A successful push confirms only that the code was delivered; verify deployment logs and the running application when access is available, and otherwise report deployment as unverified.

# Release notes (Chinese)

Every feature or fix merged into `master` must ship with release notes in Chinese:

- On the feature branch, add one entry at the top of `frontend/src/data/changelog.json`: a unique `id`, `date` (YYYY-MM-DD), a short `title`, and `changes` as `{ "type": "new" | "improve" | "fix", "text": "..." }` items written for the two users, not for developers. Do not set `version`; it is derived from the merge commit (`frontend/scripts/changelog.mjs`).
- The merge commit into `master` uses a Chinese message: the release title as the subject and the same change items as the body.
- The About page shows these entries, and the post-deploy email (`deploy/notify.mjs`) sends the entries added since the previous deployment.
