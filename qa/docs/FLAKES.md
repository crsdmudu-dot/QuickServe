# QA Flake Management

The policy for handling non-deterministic test results in the `qa/` workspace.
See also [ARCHITECTURE.md §19–20](./ARCHITECTURE.md).

## Definitions

A **flake** is a test that passes and fails on the identical commit with no code
change. Classify every flake into exactly one category:

- **Application flake** — a real product race/bug. **File a product issue; do NOT
  quarantine the test.** The test is doing its job.
- **Test flake** — a missing wait/ordering assumption in the test. **Fix the test**
  (add a real-signal wait or `expect.poll`; never a fixed sleep).
- **Environment contention** — CPU / dev-server starvation under high parallelism
  (notably Firefox/WebKit in the full 3-browser run). **Not a defect.** Handled by
  the browser-scope policy and the advisory multi-browser gate.

## Rules

- **Reruns:** a single automatic rerun is acceptable only for L2/L3 under CI
  `retries: 2`. Locally (`retries: 0`) a failure is investigated, never blindly
  re-run to green.
- **Blocks merge when:** an L0/L1 health-test fails; a Chromium feature test fails
  deterministically; any test fails twice on the same commit.
- **Quarantine:** allowed only for a confirmed *environment-contention* flake in a
  *non-Chromium* project, via `test.fixme` / an `@quarantine` tag, and only with a
  row in the table below. **Never** quarantine a Chromium feature test or a
  health-test. **Max duration: 14 days**, then fix or escalate.
- **Retry settings:** keep `retries: CI ? 2 : 0`. Do not raise local retries to mask
  flakes.
- **Ownership:** the slice author owns flakes they introduce; the QA-architecture
  owner owns shared-infra flakes.

## Firefox/WebKit contention (known)

The full multi-browser run (3 projects × high worker count on a single machine +
one shared Expo dev server) can intermittently time out on `toBeVisible` under CPU
starvation. This is environmental. Mitigation: Chromium is the default feature gate;
multi-browser runs are **advisory** at `--workers=2`. A *deterministic*
cross-browser failure (reproducible, not contention) is a real bug and blocks.

## Quarantine register

| Test | Project | Symptom | Suspected cause | Owner | Opened | Expires |
|---|---|---|---|---|---|---|
| _(none)_ | | | | | | |
