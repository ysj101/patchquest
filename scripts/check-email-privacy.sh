#!/bin/sh
# コミットと PR のメタデータに、許可していないメールアドレスが入っていないか調べる。
#
# 使い方:
#   scripts/check-email-privacy.sh                   # origin/main..HEAD の全コミット
#   scripts/check-email-privacy.sh BASE..HEAD        # 任意の範囲
#   scripts/check-email-privacy.sh --commit-msg FILE # commit-msg フック（作成中のコミット）
#   PR_TITLE=... PR_BODY=... scripts/check-email-privacy.sh [RANGE]
#
# 調べる場所: author / committer のメール欄、コミットメッセージ全文、PR の題名と本文。
# ファイルの中身は調べない。
#
# 許可するアドレスは末尾一致で判定する。EMAIL_ALLOWLIST（空白区切り）で差し替えられる。
# 一致したアドレスは @ より前を伏せて表示する。
set -eu

allowlist=${EMAIL_ALLOWLIST-"@users.noreply.github.com noreply@github.com noreply@anthropic.com"}
email_pattern='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z][A-Za-z]+'
failed=0

is_allowed() {
  addr=$(printf '%s' "$1" | tr 'A-Z' 'a-z')
  for suffix in $allowlist; do
    suffix=$(printf '%s' "$suffix" | tr 'A-Z' 'a-z')
    case "$addr" in
      *"$suffix") return 0 ;;
    esac
  done
  return 1
}

# $1: 場所の名前, $2: 調べる文字列
check_text() {
  for addr in $(printf '%s\n' "$2" | grep -oE "$email_pattern" | sort -u); do
    if ! is_allowed "$addr"; then
      printf 'email guard: %s contains a non-allowlisted address (***@%s).\n' "$1" "${addr#*@}" >&2
      failed=1
    fi
  done
}

if [ "${1-}" = "--commit-msg" ]; then
  [ -n "${2-}" ] || { echo 'usage: check-email-privacy.sh --commit-msg FILE' >&2; exit 2; }
  check_text 'commit message' "$(cat "$2")"
  for role in AUTHOR COMMITTER; do
    email=$(git var "GIT_${role}_IDENT" | sed 's/.*<//; s/>.*//')
    check_text "$(printf '%s' "$role" | tr 'A-Z' 'a-z') email" "$email"
  done
else
  range=${1:-origin/main..HEAD}
  for sha in $(git rev-list "$range" --); do
    short=$(git rev-parse --short "$sha")
    check_text "commit $short author email" "$(git log -1 --format=%ae "$sha" --)"
    check_text "commit $short committer email" "$(git log -1 --format=%ce "$sha" --)"
    check_text "commit $short message" "$(git log -1 --format=%B "$sha" --)"
  done
  check_text 'PR title' "${PR_TITLE-}"
  check_text 'PR body' "${PR_BODY-}"
fi

if [ "$failed" -ne 0 ]; then
  printf 'email guard: use a noreply address (allowed: %s).\n' "$allowlist" >&2
  exit 1
fi
echo 'email guard: no non-allowlisted addresses found.'
