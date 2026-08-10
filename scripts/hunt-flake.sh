#!/bin/bash
#
# Run a package's test suite until it fails, and keep the whole log of the run
# that failed.
#
#   scripts/hunt-flake.sh apps/web 30
#
# ── Why this exists ─────────────────────────────────────────────────────────
#
# A pair of tests in the member app — `env-netcash` and `whatsapp.preferences`
# — has failed together twice in a full run and passed standalone every time.
# Neither occurrence was captured, so the one fact that would separate a timeout
# from shared state (what the assertion actually said) has never been seen.
#
# Both times the sighting was lost the same way: the suite was re-run to
# "confirm" it, came back green, and the evidence was gone. A flake is caught
# once. Everything about this script is arranged around not wasting that.
#
# ── Two traps, both of which cost a session ─────────────────────────────────
#
# 1. DETECTION IS THE EXIT CODE, NEVER A TEXT MATCH.
#    A previous attempt grepped for "FAIL" and matched *passing* tests whose
#    names contain the word FAILED — of which this suite has several, because
#    it tests failure handling. It reported a catch on run 1 and had caught
#    nothing.
#
# 2. RUN IT ALONE.
#    A previous attempt ran this beside a dev server. The machine ran out of
#    room to spawn processes, Turbopack died with 0xc0000142, and an hour went
#    into diagnosing a dev server that was only a casualty. Stop other work
#    first.
#
set -u

PKG="${1:-apps/web}"
RUNS="${2:-30}"
OUT="${TMPDIR:-/tmp}/flake-hunt"
mkdir -p "$OUT"
: > "$OUT/status.txt"

cd "$(dirname "$0")/../$PKG" || exit 1
echo "hunting in $PKG, up to $RUNS runs — logs in $OUT"

for i in $(seq 1 "$RUNS"); do
  npx vitest run --reporter=verbose > "$OUT/run.log" 2>&1
  code=$?
  if [ $code -ne 0 ]; then
    cp "$OUT/run.log" "$OUT/CAUGHT.log"
    echo "CAUGHT on run $i (exit $code)" | tee -a "$OUT/status.txt"
    echo
    echo "The whole log is at $OUT/CAUGHT.log — read it before running anything"
    echo "else. Do not re-run the suite to check: green tells you nothing you"
    echo "did not already know, and the sighting is spent."
    exit 0
  fi
  echo "run $i clean" >> "$OUT/status.txt"
done

echo "$RUNS runs, all clean" | tee -a "$OUT/status.txt"
