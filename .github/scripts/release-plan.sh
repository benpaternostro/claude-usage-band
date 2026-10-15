#!/usr/bin/env bash
# Decides what a push to main releases, from the commits between $1 and $2.
# Prints `bump=<none|patch|minor|major|skip>` and `reason=<why>`.
#   skip   nothing to release
#   none   the push set a new version itself: release it as it is
#   patch  the plugin changed: bump by the merged PR's label, `minor` or
#   minor  `major`, a patch otherwise; a `no-release` label skips it
#   major
# Only the plugin's own files release: docs, tests and workflows do not.
set -euo pipefail

before=$1
after=$2
repo=${GITHUB_REPOSITORY:?}

out() { echo "bump=$1"; echo "reason=$2"; }

pr=$(gh api "repos/$repo/commits/$after/pulls" --jq '.[0].number // empty')
labels=''
if [ -n "$pr" ]; then
  labels=$(gh api "repos/$repo/issues/$pr/labels" --jq '.[].name')
fi
has() { grep -qx "$1" <<<"$labels"; }

if has no-release; then
  out skip "PR #$pr is labelled no-release"
  exit 0
fi

version() { git show "$1:.claude-plugin/plugin.json" | jq -r .version; }
old=$(version "$before")
new=$(version "$after")
if [ "$old" != "$new" ]; then
  if git ls-remote --exit-code --tags origin "usage-band--v$new" >/dev/null; then
    out skip "usage-band--v$new is already released"
  else
    out none "the version was set to $new"
  fi
  exit 0
fi

if ! git diff --name-only "$before" "$after" | grep -qE '^(hooks/|types/|\.claude-plugin/)'; then
  out skip "no plugin files changed"
  exit 0
fi

if has major; then out major "PR #$pr is labelled major"
elif has minor; then out minor "PR #$pr is labelled minor"
else out patch "the plugin changed"
fi
