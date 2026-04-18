# opencode-corn

`opencode-corn` is an OpenCode plugin plus runner pair for scheduled agent jobs.

It keeps scheduling state on disk, installs OS-native jobs, and executes work in one of two modes:

- `cli`: spawn a fresh `opencode` command for each run
- `attach`: connect to an OpenCode server with `@opencode-ai/sdk`, create or reuse a session, and submit the prompt directly
