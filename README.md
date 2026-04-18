# opencode-corn

Run OpenCode jobs on a schedule with a resident gateway.

`opencode-corn` is an [OpenCode](https://opencode.ai) plugin that lets you create recurring jobs in natural language. Unlike OS-driven schedulers that install one timer per job, `opencode-corn` keeps job definitions on disk and uses a long-lived gateway process to poll for due work and execute it.

This README is user-facing and is structured with the same bias as [different-ai/opencode-scheduler](https://github.com/different-ai/opencode-scheduler): quick install, examples, operational commands, and storage details. The implementation here is still specific to `opencode-corn`.

## Features

- Create scheduled OpenCode jobs through conversation
- Manage jobs with `create`, `list`, `get`, `update`, `pause`, `resume`, `run`, and `remove`
- Run jobs through a resident gateway instead of one OS timer per job
- Store job definitions, run records, logs, and locks on disk
- Support both `cli` and `attach` execution modes
- Restart the gateway automatically through a platform startup hook

## Install

Install from npm:

```bash
npm install -g opencode-corn
```

Or install the local package built from this repo:

```bash
npm install -g ./opencode-corn-0.2.0.tgz
```

This package installs three binaries:

- `opencode-corn-gateway`
- `opencode-corn-runner`
- `opencode-corn-manage`

Defined in [package.json](L:/Data/opencode-corn/package.json:8).

## Load In OpenCode

Create a local plugin file in your project:

```ts
// .opencode/plugins/opencode-corn.ts
export { OpencodeCornPlugin as default } from "../../dist/src/index.js"
```

The plugin exports two tools:

- `cronjob`
- `cron_logs`

Source:

- [src/index.ts](L:/Data/opencode-corn/src/index.ts:5)

## Quick Start

Open an OpenCode session in your project and say:

```text
Please create a corn job in this project:
- name: git-status-minute
- cron: * * * * *
- timezone: Asia/Shanghai
- mode: cli
- timeout: 120 seconds
- task: check git status --short and summarize whether there are uncommitted changes
```

Then ask:

```text
Run that job now.
```

And later:

```text
Show me the logs for that job.
```

## Job Management

You can manage jobs entirely through conversation:

| Action | Example |
|------|------|
| Create | `Schedule a corn job every day at 9am to summarize repo status` |
| List | `Show all corn jobs in this project` |
| Get | `Show details for job <job-id>` |
| Update | `Update job <job-id> to run every 6 hours` |
| Pause | `Pause job <job-id>` |
| Resume | `Resume job <job-id>` |
| Run now | `Run job <job-id> now` |
| Logs | `Show logs for job <job-id>` |
| Remove | `Delete job <job-id>` |

Implemented in [src/plugin/cronjob-tool.ts](L:/Data/opencode-corn/src/plugin/cronjob-tool.ts:56) and [src/plugin/logs-tool.ts](L:/Data/opencode-corn/src/plugin/logs-tool.ts:7).

## How It Works

1. OpenCode calls the `cronjob` tool
2. The tool writes a scoped job definition to local storage
3. The plugin ensures the resident gateway is installed and running
4. The gateway scans all stored jobs on a fixed interval
5. Due jobs are executed by the runner
6. The runner appends logs and run history, then updates `nextRunAt`

Relevant code:

- Gateway bootstrap: [src/gateway/control.ts](L:/Data/opencode-corn/src/gateway/control.ts:8)
- Gateway runtime: [src/gateway/runtime.ts](L:/Data/opencode-corn/src/gateway/runtime.ts:48)
- Runner: [src/core/runner.ts](L:/Data/opencode-corn/src/core/runner.ts:13)

## Execution Modes

### `cli`

Spawns a fresh OpenCode command:

```text
opencode run --non-interactive --print <rendered prompt>
```

This is the easiest mode to run locally.

### `attach`

Connects to an existing OpenCode backend via `@opencode-ai/sdk`, creates or reuses a session, and submits the prompt directly.

Implementation:

- [src/core/runner.ts](L:/Data/opencode-corn/src/core/runner.ts:61)
- [src/core/runner.ts](L:/Data/opencode-corn/src/core/runner.ts:100)

## Gateway CLI

`opencode-corn-gateway` supports:

- `serve`
- `install-service`
- `uninstall-service`
- `status`

Source:

- [src/bin/gateway.ts](L:/Data/opencode-corn/src/bin/gateway.ts:11)

## Storage

Default root directory:

```text
~/.config/opencode/cron
```

Layout:

```text
rootDir/
  gateway/
    runtime.json
    gateway.lock.json
  scopes/
    <scope>/
      jobs/
        <jobId>.json
      runs/
        <jobId>.jsonl
      locks/
        <jobId>.lock.json
  logs/
    <scope>/
      <jobId>.log
```

Storage code:

- [src/store/job-store.ts](L:/Data/opencode-corn/src/store/job-store.ts:6)
- [src/gateway/paths.ts](L:/Data/opencode-corn/src/gateway/paths.ts:3)

## Reliability

- One gateway process at a time through a global gateway lock
- One active execution per job through job-level locks
- Stale lock cleanup based on PID liveness
- Heartbeat state in `runtime.json`
- Timeout control per job
- Manual `run now` path that bypasses the poll wait

Known current limits:

- No retry or backoff
- No missed-run catch-up
- Startup integration is user-level by default

## Platform Startup Model

`opencode-corn` does not install one OS scheduler entry per job. It installs a startup hook for the resident gateway.

| Platform | Startup integration | Result |
|------|------|------|
| macOS | `LaunchAgent` | Starts when the user session loads |
| Linux | `systemd --user` | User-level service |
| Windows | `schtasks /SC ONLOGON` | Starts after user logon |

Managers:

- [src/gateway/service/launchd.ts](L:/Data/opencode-corn/src/gateway/service/launchd.ts:10)
- [src/gateway/service/linux-systemd.ts](L:/Data/opencode-corn/src/gateway/service/linux-systemd.ts:10)
- [src/gateway/service/windows.ts](L:/Data/opencode-corn/src/gateway/service/windows.ts:7)

## Defaults

Current defaults:

```text
rootDir = ~/.config/opencode/cron
defaultCommand = opencode
gatewayCommand = opencode-corn-gateway
gatewayPollIntervalMs = 30000
```

Defined in [src/core/schema.ts](L:/Data/opencode-corn/src/core/schema.ts:59).

## More Detail

The detailed architecture, persistence model, and execution flow are documented in [opencode-corn.md](L:/Data/opencode-corn/opencode-corn.md).
