# Release process & lessons learned

How Centuria ships desktop builds, and the failure modes we hit doing the
v1.1.0 release (so we never repeat them).

## How releases work

The pipeline is `.github/workflows/release.yml`, triggered by **pushing a
`v*` tag** (or a manual `workflow_dispatch`). It has three jobs:

1. **`create-release`** — creates a *draft* GitHub release for the tag, with
   the download table in the body.
2. **`release`** (matrix: ubuntu / windows / macos) — `npm run build` then
   `npx electron-builder --publish always`, which builds the installer for
   each platform and uploads it to the release for that tag.
3. **`publish-release`** — flips the draft to published.

`electron-builder` finds the release **by tag** and uploads assets to it. The
version it builds comes from `package.json` **at the checked-out commit** — not
from the tag name.

## The correct way to cut a release

```bash
# 1. Bump the version in package.json and commit it ON main (via PR).
#    The tag and package.json version MUST match.

# 2. Tag the exact commit on main that has the bumped version, and push.
git checkout main && git pull
git tag v1.2.0            # tag the HEAD that contains "version": "1.2.0"
git push origin v1.2.0   # this push is what triggers the release workflow
```

Then leave it alone. One tag push → one clean run → installers appear on the
published release. Do **not** pre-create the release in the GitHub UI, and do
**not** push the tag before the version-bump commit is on `main`.

## What went wrong with v1.1.0 (and the lessons)

The v1.1.0 release took ~6 workflow runs to get installers onto the release.
Root causes, in order of how much pain they caused:

### 1. The workflow stranded installers in an orphaned draft (the real bug)

`create-release` only deleted a pre-existing release **if it was a draft**. A
*published* release for the tag was left in place. When one already existed,
`gh release create <tag> --draft` couldn't attach to the taken tag, so it
silently created a **separate orphaned `untagged-*` draft**. `electron-builder`
then uploaded the installers into that orphan, while `publish-release`
re-published the *original* source-only release. Every run reported success;
the binaries were just invisible.

> **Lesson:** when a step is meant to be idempotent, make it idempotent against
> *every* prior state, not just the happy one. Fixed in the workflow by
> deleting any existing release for the tag — draft **or** published — before
> recreating. "The job is green" ≠ "the artifact is where you think it is" —
> verify the actual asset list, not just the run conclusion.

### 2. The tag pointed at a commit without the version bump

The tag was pushed before the `version: 1.1.0` commit reached `main`, and again
after `main` advanced past it. `electron-builder` builds the version from
`package.json` at the checked-out commit, so runs against stale commits built
`1.0.1` installers and tried to publish them to the old `v1.0.1` release.

> **Lesson:** the tag must point at a commit whose `package.json` already
> carries the matching version. Tag *after* the bump is merged to `main`, and
> move the tag if `main` advances before the release succeeds.

### 3. electron-builder's GitHub publisher refuses old releases

`electron-builder` skips uploading to a release that was **published more than
2 hours ago** (a safety against clobbering a real release). Re-running against a
release published earlier that day produced `skipped publishing … existing
release published more than 2 hours ago` — a silent no-op that looks like
success.

> **Lesson:** if you re-run a release hours later, the publisher may quietly
> skip uploads. Start from a fresh draft (the workflow now does this) rather
> than re-uploading to a long-published release.

### 4. Tag pushes are environment-gated

The tag could not be pushed from the remote/CI execution environment (HTTP 403
on `git push origin <tag>`); it had to come from a local machine with push
rights. `git push` reported "Everything up-to-date" even though the tag didn't
reach the remote.

> **Lesson:** confirm the tag actually landed on the remote
> (`git ls-remote --tags origin`) before assuming a release will trigger.

## Quick recovery if installers are missing from a release

```bash
# Delete the broken release + tag and any orphaned drafts, then re-tag clean.
gh release delete vX.Y.Z --yes --cleanup-tag
gh release list                       # find any leftover untagged-* drafts
gh release delete untagged-xxxx --yes
git checkout main && git pull
git tag vX.Y.Z                        # HEAD must carry the matching version
git push origin vX.Y.Z
```

With the current workflow this is rarely needed — a clean tag push from `main`
should just work.

## Worth sharing upstream

Two behaviours here are general `electron-builder` + GitHub Actions gotchas
that bit us and would likely bite others; if reporting upstream or writing
this up externally, these are the transferable findings:

- `gh release create <tag> --draft` against a tag that already has a published
  release produces a **silent orphaned `untagged-*` draft** instead of erroring
  — easy to build a "publish" pipeline on top of without noticing.
- `electron-builder`'s GitHub publisher **silently skips** uploads to releases
  published more than 2 hours ago. Combined with a green workflow, this makes a
  failed publish indistinguishable from a successful one without inspecting the
  asset list.
