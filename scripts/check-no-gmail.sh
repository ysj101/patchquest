#!/bin/sh
# 指定範囲のコミットのメタデータと、環境変数で渡された PR のタイトル・本文を検査する。
set -eu

range=${1:-origin/main..HEAD}
commits=$(git rev-list "$range")
failed=0
for sha in $commits; do
  metadata=$(git log -1 --format='%ae%n%ce%n%B' "$sha")
  if ! printf '%s\n' "$metadata" | awk -v sha="$sha" '
    index(tolower($0), "@gmail.com") {
      field = NR == 1 ? "author email" : NR == 2 ? "committer email" : "message body"
      if (!seen[field]++) print "gmail-guard: commit " sha " matched " field > "/dev/stderr"
      failed = 1
    }
    END { exit failed }
  '; then
    failed=1
  fi
done

if printf '%s\n' "${PR_TITLE:-}" | grep -Fiq '@gmail.com'; then
  printf '%s\n' 'gmail-guard: matched PR title' >&2
  failed=1
fi
if printf '%s\n' "${PR_BODY:-}" | grep -Fiq '@gmail.com'; then
  printf '%s\n' 'gmail-guard: matched PR body' >&2
  failed=1
fi
if [ "$failed" -eq 0 ]; then
  printf '%s\n' 'gmail-guard: passed'
fi
exit "$failed"
