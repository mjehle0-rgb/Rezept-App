---
name: ensure-tests-pass
description: "Use when: preparing to commit or create a PR; validates all tests pass, checks coverage, and flags untested code before merging"
type: skill
when: "user runs /ensure-tests-pass or before committing"
outputs:
  - test-report: Summary of test results and coverage metrics
  - flagged-files: Files with low or missing test coverage
---

# Ensure Tests Pass

Validates test coverage and quality gates before commits/PRs.

## What This Does

- Runs your full test suite and reports failures
- Checks test coverage thresholds
- Identifies untested or under-tested files
- Blocks commits if tests fail or coverage is too low
- Generates a pre-flight report

## Usage

```
/ensure-tests-pass
/ensure-tests-pass --coverage-threshold 80
/ensure-tests-pass --check-only
```

## Parameters

| Flag | Default | Purpose |
|------|---------|---------|
| `--coverage-threshold` | 70 | Minimum coverage % to pass |
| `--check-only` | false | Report only, don't block commit |
| `--verbose` | false | Show full test output |

## Workflow

1. **Run Tests** → Execute test suite and collect results
2. **Check Coverage** → Verify coverage meets threshold
3. **Flag Untested** → Identify files with gaps
4. **Report** → Summary of pass/fail and recommendations
5. **Block/Warn** → Prevent commit if quality gates fail (unless `--check-only`)

## Quality Gates

- ✓ All tests pass
- ✓ Coverage ≥ threshold %
- ✓ No untested critical paths
- ✓ No deprecated test patterns

## Examples

### Pre-commit check
```bash
/ensure-tests-pass
```
Runs tests, checks 70% coverage minimum, blocks commit if fails.

### Audit mode
```bash
/ensure-tests-pass --check-only --verbose
```
Reports on test health without blocking workflow.

### Strict mode
```bash
/ensure-tests-pass --coverage-threshold 90
```
Requires 90% coverage to proceed.

## Integration

Hook this into:
- Pre-commit hooks (via git hook)
- CI/CD pipelines
- Pull request checks
- Manual pre-release review

## See Also

- [Test strategy guide](./.github/testing-strategy.md) — test organization and patterns
- [Coverage reports](./.github/coverage/) — baseline coverage data
