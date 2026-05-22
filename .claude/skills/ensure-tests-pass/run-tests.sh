#!/bin/bash
# Test validation script for ensure-tests-pass skill

set -e

COVERAGE_THRESHOLD=${1:-70}
CHECK_ONLY=${2:-false}
VERBOSE=${3:-false}

echo "🧪 Running test suite..."
echo "📊 Coverage threshold: ${COVERAGE_THRESHOLD}%"

# Run tests with coverage
if [ "$VERBOSE" = "true" ]; then
  npm test -- --coverage
else
  npm test -- --coverage --silent 2>/dev/null || npm test -- --coverage
fi

# Extract coverage percentage (adjust for your test runner)
COVERAGE=$(npm test -- --coverage --passWithNoTests 2>/dev/null | grep -oP 'Statements\s+:\s+\K[\d.]+' || echo "0")

echo ""
echo "📈 Coverage Result: ${COVERAGE}%"

if (( $(echo "$COVERAGE < $COVERAGE_THRESHOLD" | bc -l) )); then
  echo "❌ Coverage below threshold (${COVERAGE}% < ${COVERAGE_THRESHOLD}%)"
  if [ "$CHECK_ONLY" = "false" ]; then
    exit 1
  fi
else
  echo "✅ Coverage meets threshold (${COVERAGE}% ≥ ${COVERAGE_THRESHOLD}%)"
fi

echo ""
echo "✨ All checks passed! Ready to commit."
exit 0
