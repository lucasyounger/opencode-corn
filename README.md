# opencode-corn

`opencode-corn` is an OpenCode plugin, resident gateway, and runner for scheduled agent jobs.

It keeps scheduling state on disk, runs an internal polling scheduler inside a long-lived gateway process, and installs a single OS startup hook so the gateway comes back after reboot.

The gateway can be managed with `opencode-corn-gateway`:

- `serve`: run the resident scheduler loop
- `install-service`: install the startup hook for the current OS
- `uninstall-service`: remove the startup hook
- `status`: print the last gateway heartbeat

Job execution still supports two modes:

- `cli`: spawn a fresh `opencode` command for each run
- `attach`: connect to an OpenCode server with `@opencode-ai/sdk`, create or reuse a session, and submit the prompt directly
