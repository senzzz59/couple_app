# Feature delivery workflow

For every requested feature or fix, create a `feature/<descriptive-name>` branch from the latest `master` before editing. Complete implementation and required checks on that branch, commit and push the feature branch, then merge it into `master` and push `master`. Preserve unrelated work and remote commits; never force-push. Report the delivered commit and any checks or deployment status that remain unverified.

Pushing changes to `master` triggers the configured GitHub webhook, which redeploys the application on the user's server. Treat pushing `master` as the deployment trigger: complete the required checks before merging and pushing. A successful push confirms only that the code was delivered; verify deployment logs and the running application when access is available, and otherwise report deployment as unverified.
