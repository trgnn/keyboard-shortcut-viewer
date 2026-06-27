#!/usr/bin/env bash
#
# tag-release.sh — tag the latest commit (HEAD) as a milestone.
#
# It does NOT create a separate release commit: it folds the KSV_VERSION bump
# into the current HEAD (git commit --amend) and lays an annotated tag on it.
# Because it rewrites HEAD, push with:
#     git push --force-with-lease --follow-tags
#
# Run it (from anywhere in the repo), review the preview, then enter the new
# version and its description:
#     tools/tag-release.sh
# Version + description can also be passed as args to skip the prompts:
#     tools/tag-release.sh v1.1 "Mobile height fix and SVG icons"
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/site/config.js"
cd "$ROOT"

# The amend must carry only the version bump, so the tree has to be clean first.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree not clean — commit or stash your work first," >&2
  echo "       so the amend only folds in the version bump." >&2
  exit 1
fi

# --- current state --------------------------------------------------------
current_cfg="$(sed -nE "s/^const KSV_VERSION = '([^']*)';/\1/p" "$CONFIG")"
last_tag="$(git for-each-ref refs/tags --sort=-creatordate --format='%(refname:short)' | head -1)"
if [[ -n "$last_tag" ]]; then
  last_msg="$(git for-each-ref "refs/tags/$last_tag" --format='%(contents:subject)')"
  current_line="$last_tag — $last_msg"
  current_commit="$(git log -1 --format='%h  %s' "$last_tag^{commit}")"
else
  current_line="(no tag yet — config.js: ${current_cfg:-?})"
  current_commit="(—)"
fi
head_commit="$(git log -1 --format='%h  %s')"

# --- preview --------------------------------------------------------------
echo
echo "Version actuelle : $current_line"
echo "  ↳ $current_commit"
echo
echo "Commit à tagguer : $head_commit"
echo

# --- inputs (args optional, else prompt) ----------------------------------
VERSION="${1:-}"
MESSAGE="${2:-}"
[[ -n "$VERSION" ]] || read -rp "Nouvelle version (ex. v1.1) : " VERSION
[[ -n "$MESSAGE" ]] || read -rp "Description du jalon         : " MESSAGE

# --- validate -------------------------------------------------------------
if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+$ ]]; then
  echo "error: version must look like v1.2 (got '$VERSION')" >&2; exit 1
fi
if [[ -z "$MESSAGE" ]]; then
  echo "error: a milestone description is required" >&2; exit 1
fi
if git rev-parse -q --verify "refs/tags/$VERSION" >/dev/null; then
  echo "error: tag $VERSION already exists" >&2; exit 1
fi

# --- confirm (amend rewrites HEAD) ----------------------------------------
echo
echo "→ Set KSV_VERSION=$VERSION, fold it into HEAD ($head_commit) via amend, and tag $VERSION."
read -rp "Continue? [y/N] " ok
[[ "$ok" == "y" || "$ok" == "Y" ]] || { echo "aborted."; exit 0; }

# --- apply ----------------------------------------------------------------
# Rewrite the KSV_VERSION literal in place (BSD/macOS sed).
sed -i '' -E "s/^const KSV_VERSION = '[^']*';/const KSV_VERSION = '$VERSION';/" "$CONFIG"
if ! grep -q "const KSV_VERSION = '$VERSION';" "$CONFIG"; then
  echo "error: failed to update KSV_VERSION in $CONFIG" >&2
  git checkout -- "$CONFIG"; exit 1
fi

git add "$CONFIG"
git commit --amend --no-edit >/dev/null
git tag -a "$VERSION" -m "$MESSAGE"

echo
echo "Tagged $VERSION on $(git rev-parse --short HEAD) (HEAD amended)."
echo "Push:  git push --force-with-lease --follow-tags"
