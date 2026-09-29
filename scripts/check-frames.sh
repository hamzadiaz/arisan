#!/usr/bin/env bash
# Every walkthrough scene needs six different frames (docs/ANIMATION_SPEC.md).
# Fails if a frame is missing or any two frames in a scene share a SHA-256.
set -euo pipefail
cd "$(dirname "$0")/.."

status=0
for scene in circle pay payout wallet; do
  files=()
  for i in 1 2 3 4 5 6; do
    f="public/assets/frames/${scene}-0${i}.png"
    if [[ -f "$f" ]]; then files+=("$f"); else echo "MISSING $f"; status=1; fi
  done
  [[ ${#files[@]} -eq 0 ]] && continue
  hashes=$(shasum -a 256 "${files[@]}")
  echo "$hashes"
  dupes=$(echo "$hashes" | awk '{print $1}' | sort | uniq -d)
  if [[ -n "$dupes" ]]; then
    for h in $dupes; do
      echo "DUPLICATE ${scene}: $(echo "$hashes" | awk -v h="$h" '$1 == h {print $2}' | xargs)"
    done
    status=1
  else
    echo "OK ${scene}: ${#files[@]} unique frames"
  fi
done
exit $status
