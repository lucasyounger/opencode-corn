# opencode-cron

`opencode-cron` 是一个面向 OpenCode 的定时任务插件。它允许你用自然语言创建周期性任务，但实际执行并不是为每个任务单独安装一个系统定时器，而是通过一个常驻的 Gateway 进程统一轮询、触发、执行和记录任务。

当前仓库的 npm 包名规划为 `@love-ai/opencode-cron`。本仓库当前阶段先完成代码和文档改名，暂不执行实际发布。

## 项目定位

`opencode-cron` 适合这类场景：

- 每天定时检查代码仓库状态并生成日报
- 每隔一段时间运行 OpenCode 任务
- 通过 Webhook 在成功或失败时推送结果
- 在本地机器上以较轻量的方式长期维护一组定时任务

与“每个任务一个系统 cron / schtasks 项”的方式不同，`opencode-cron` 的核心思路是：

- 任务定义持久化到磁盘
- Gateway 进程常驻运行
- Gateway 固定间隔扫描到期任务
- Runner 执行任务并写入日志、运行记录和下一次调度时间

## 核心能力

- 通过 OpenCode 插件工具创建、查询、更新、暂停、恢复、立即执行、删除任务
- 支持 `cli` 与 `attach` 两种执行模式
- 支持传递 `agent`、`model`、`skills`、`timeoutSeconds` 等执行参数
- 支持日志读取与运行记录落盘
- 支持通过 Webhook 投递执行结果
- 支持 Windows、macOS、Linux 的开机/登录自动启动 Gateway
- 支持作业级锁与 Gateway 全局锁，避免重复执行

## 当前实现概览

当前主执行链路如下：

1. OpenCode 调用插件工具 `cronjob`
2. `cronjob` 将任务写入本地存储
3. 插件确保 Gateway 启动基础设施存在且在线
4. Gateway 周期性扫描所有 scope 下的任务
5. 到期任务交给 Runner 执行
6. Runner 记录日志、run record、更新时间和下次运行时间
7. 如果配置了 Webhook，则投递执行结果

核心代码入口：

- 插件入口：[src/index.ts](src/index.ts)
- 任务工具：[src/plugin/cronjob-tool.ts](src/plugin/cronjob-tool.ts)
- 日志工具：[src/plugin/logs-tool.ts](src/plugin/logs-tool.ts)
- Gateway 控制：[src/gateway/control.ts](src/gateway/control.ts)
- Gateway 运行时：[src/gateway/runtime.ts](src/gateway/runtime.ts)
- Runner：[src/core/runner.ts](src/core/runner.ts)
- 存储：[src/store/job-store.ts](src/store/job-store.ts)

## 安装方式

### 1. 本地开发安装

当前仓库尚未发布到 npm，开发阶段建议直接在仓库根目录安装：

```bash
npm install -g .
```

如果只想打包验证发布产物，可以执行：

```bash
npm pack
```

### 2. 未来发布后的安装方式

发布后，推荐安装命令会是：

```bash
npm install -g @love-ai/opencode-cron
```

### 3. 构建

仓库开发时需要先构建 TypeScript 输出：

```bash
npm install
npm run build
```

## 在 OpenCode 中加载插件

如果你是在本仓库里本地开发和测试插件，可以创建：

```ts
// .opencode/plugins/opencode-cron.ts
export { default } from "../../dist/src/index.js"
```

当前插件导出两个工具：

- `cronjob`
- `cron_logs`

## 快速开始

### 1. 创建一个每天 9 点执行的任务

在 OpenCode 会话里直接说：

```text
请在当前项目创建一个 cron 任务：
- 名称：repo-daily-report
- cron：0 9 * * *
- 时区：Asia/Shanghai
- 模式：cli
- 超时：180 秒
- 任务：检查最近 24 小时的代码变更，并输出新增文件、修改文件、潜在风险和建议关注点
```

### 2. 立即执行一次

```text
立即运行刚才那个任务。
```

### 3. 查看日志

```text
查看刚才那个任务的日志。
```

## 支持的管理动作

`cronjob` 工具当前支持以下动作：

- `create`
- `list`
- `get`
- `update`
- `pause`
- `resume`
- `run`
- `remove`

典型自然语言示例：

- 创建任务：`请在当前项目创建一个每天早上 9 点执行的 cron 任务，生成代码日报。`
- 列出任务：`列出当前项目的所有 cron 任务。`
- 查看详情：`查看任务 <job-id> 的详情。`
- 更新任务：`把任务 <job-id> 改成每 6 小时执行一次。`
- 暂停任务：`暂停任务 <job-id>。`
- 恢复任务：`恢复任务 <job-id>。`
- 立即执行：`立即运行任务 <job-id>。`
- 查看日志：`查看任务 <job-id> 的日志。`
- 删除任务：`删除任务 <job-id>。`

## 任务字段说明

创建或更新任务时，当前实现支持这些关键字段：

- `name`：任务名
- `prompt`：实际执行任务的提示词
- `schedule`：标准 5 段 cron 表达式
- `timezone`：IANA 时区名称，例如 `Asia/Shanghai`
- `workdir`：任务工作目录
- `mode`：`cli` 或 `attach`
- `attachUrl`：`attach` 模式连接的 OpenCode 服务地址
- `sessionStrategy`：`new` 或 `reuse`
- `sessionId`：复用会话时使用
- `agent`：指定 OpenCode agent
- `providerID` / `modelID`：指定模型
- `skills`：附加 skills 列表
- `timeoutSeconds`：超时时间，最大 86400 秒
- `webhookUrl`：成功时投递地址
- `failureWebhookUrl`：失败时投递地址

内部默认值见 [src/core/schema.ts](src/core/schema.ts) 和 [src/plugin/cronjob-tool.ts](src/plugin/cronjob-tool.ts)。

## 执行模式

### `cli`

`cli` 模式会启动一个新的 `opencode run` 子进程执行任务。当前实现会：

- 自动使用无人值守的一次性执行提示词包装任务
- 在配置了 `agent` / `model` 时自动传给 `opencode run`
- 在 Windows 上通过 `taskkill /T /F` 回收超时进程树

对应实现：

- [src/core/process.ts](src/core/process.ts)
- [src/core/prompt.ts](src/core/prompt.ts)
- [src/core/runner.ts](src/core/runner.ts)

### `attach`

`attach` 模式通过 `@opencode-ai/sdk` 连接现有 OpenCode 服务执行任务，适合复用远端或常驻服务。

## CLI 命令

安装后会提供三个命令：

- `opencode-cron-gateway`
- `opencode-cron-runner`
- `opencode-cron-manage`

### Gateway

```bash
opencode-cron-gateway status --root <rootDir>
opencode-cron-gateway serve --root <rootDir>
opencode-cron-gateway install-service --root <rootDir>
opencode-cron-gateway uninstall-service --root <rootDir>
```

### Runner

```bash
opencode-cron-runner run --scope <scope> --job <jobId> --root <rootDir>
```

### Manage

```bash
opencode-cron-manage <rootDir> <scope>
```

## 存储结构

默认根目录：

```text
~/.config/opencode/cron
```

目录结构：

```text
rootDir/
  gateway/
    runtime.json
    gateway.lock.json
    gateway.log
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

说明：

- `jobs/*.json` 保存任务定义
- `runs/*.jsonl` 保存每次运行记录
- `locks/*.lock.json` 用于防止同一任务并发执行
- `logs/*.log` 保存文本日志
- `gateway/runtime.json` 记录 Gateway 心跳和活动任务

## 平台启动方式

当前 Gateway 自动启动策略：

- Windows：写入 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- macOS：写入 `LaunchAgent`
- Linux：写入 `systemd --user` service

对应实现：

- [src/gateway/service/windows.ts](src/gateway/service/windows.ts)
- [src/gateway/service/launchd.ts](src/gateway/service/launchd.ts)
- [src/gateway/service/linux-systemd.ts](src/gateway/service/linux-systemd.ts)

## 故障排查

### 1. 任务创建成功但不执行

建议按下面顺序检查：

1. 查看 Gateway 状态：`opencode-cron-gateway status --root <rootDir>`
2. 检查 `gateway/runtime.json` 是否有新心跳
3. 检查任务的 `nextRunAt` 是否正确
4. 检查 `logs/<scope>/<jobId>.log` 是否有输出
5. 检查 `runs/<jobId>.jsonl` 是否写入记录

### 2. 任务长时间卡住

- 优先检查 `timeoutSeconds` 是否设置过大
- 在 Windows 上，超时后当前实现会尝试强制结束整棵进程树
- 如果任务本身依赖外部服务，仍建议在 prompt 中明确约束输出范围与执行边界

### 3. 重复执行或跳过执行

- Gateway 全局锁防止同一 rootDir 启动多个 Gateway
- 任务级锁防止同一任务重叠执行
- 如果锁文件残留但进程已不存在，当前实现会清理 stale lock

## 当前限制

当前版本仍有一些明确限制：

- 不支持自动重试或退避
- 不支持 missed run 补跑
- `remove` 目前删除任务定义和锁，不主动清理历史 run/log 文件
- 仓库中仍保留了 `src/backend/*` 这一组历史后端实现，但当前主链路已经统一走 Gateway 模式

## 开发与测试

```bash
npm install
npm run build
npm test
```

如果你想进一步理解实现细节，请继续阅读设计文档：[opencode-cron.md](opencode-cron.md)
