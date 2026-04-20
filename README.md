# opencode-cron

`opencode-cron` 是一个面向 OpenCode 的定时任务插件。你可以用自然语言创建、查询、更新、暂停、恢复、立即执行和删除任务；真正的调度并不是“每个任务各装一个系统定时器”，而是交给一个常驻 Gateway 统一轮询、执行、记录和投递结果。

当前 npm 包：

```bash
npm install -g @love-ai/opencode-cron
```

仓库地址：

- [GitHub](https://github.com/lucasyounger/opencode-cron)
- [npm](https://www.npmjs.com/package/@love-ai/opencode-cron)

## 这是什么

`opencode-cron` 适合这类场景：

- 每天定时检查代码仓库并生成简短日报
- 每隔一段时间运行一次 OpenCode 任务
- 把执行结果写入日志，或在成功/失败后推送到 Webhook
- 在本地长期维护一组可追踪、可恢复的定时任务

它当前采用的是 Gateway 调度架构：

1. OpenCode 通过插件工具 `cronjob` 管理任务。
2. 任务定义持久化到本地文件系统。
3. 插件确保 Gateway 自启动配置已安装，并在需要时自举一个 Gateway 进程。
4. Gateway 按固定间隔扫描所有任务。
5. 到期任务交给 Runner 执行。
6. Runner 写入文本日志、运行记录、任务状态和下一次执行时间。
7. 如果任务配置了 Webhook，再向外部系统投递结果。

## 核心能力

- 通过 `cronjob` 工具完成 `create`、`list`、`get`、`update`、`pause`、`resume`、`run`、`remove`
- 通过 `cron_logs` 工具读取单个任务日志
- 支持 `cli` 与 `attach` 两种执行模式
- 支持传递 `agent`、`providerID`、`modelID`、`skills`、`timeoutSeconds`
- 支持日志落盘和 JSONL 运行记录
- 支持成功和失败 Webhook
- 支持 Windows、macOS、Linux 的 Gateway 开机/登录自启动
- 支持 Gateway 全局锁和任务级锁，避免重复执行

## 安装

### 全局安装

```bash
npm install -g @love-ai/opencode-cron
```

安装后会提供 3 个命令：

- `opencode-cron-gateway`
- `opencode-cron-runner`
- `opencode-cron-manage`

### 本地开发

```bash
npm install
npm run build
npm test
```

如果你只想验证当前发布产物：

```bash
npm pack
```

## 在 OpenCode 中加载插件

如果你已经通过 npm 安装了包，可以在 OpenCode 的插件文件中直接转发默认导出：

```ts
// .opencode/plugins/opencode-cron.ts
export { default } from "@love-ai/opencode-cron"
```

如果你正在仓库内本地开发，也可以直接转发构建产物：

```ts
// .opencode/plugins/opencode-cron.ts
export { default } from "../../dist/src/index.js"
```

插件当前对外暴露两个工具：

- `cronjob`
- `cron_logs`

## 可选配置

插件支持以下可选项：

- `rootDir`
  默认值：`~/.config/opencode/cron`
  说明：所有任务、日志、运行记录和 Gateway 状态文件的根目录
- `defaultCommand`
  默认值：`auto`
  说明：`cli` 模式下实际调用的命令。默认会优先尝试 `opencode`，如果当前环境没有 `opencode`，则自动回退到 `nga`
- `gatewayCommand`
  默认值：`opencode-cron-gateway`
  说明：用于自举 Gateway 的命令
- `gatewayPollIntervalMs`
  默认值：`30000`
  说明：Gateway 轮询周期，单位毫秒

`rootDir` 会先展开 `~`，再解析成绝对路径。任务的 `workdir` 会被归一化后映射到一个 scope，用来隔离不同项目目录的任务集合。

## Scope 说明

### 为什么要有 scope

`opencode-cron` 的任务、日志、运行记录和锁文件都保存在统一的全局根目录下，而不是直接写回各个项目仓库。如果没有 scope，会有几个明显问题：

- 不同项目里的任务可能重名，容易互相覆盖
- 日志、运行记录和锁会混在一起，不方便排查
- 当前项目执行 `list` 时，很难只看到“这个项目自己的任务”
- 系统层的调度和运行状态也缺少项目隔离

所以，scope 的作用就是把“同一个 `workdir` 下的任务”归到同一个逻辑分组里。

### scope 怎么生成

当前实现会先对 `workdir` 做标准化，再生成：

```text
scope-<目录名slug>-<稳定哈希>
```

例如：

```text
scope-opencode-corn-<16位哈希>
```

生成逻辑的特点：

- 前缀固定是 `scope-`
- 中间部分来自工作目录最后一级目录名，便于肉眼识别
- 最后仍保留稳定哈希，避免不同路径但同名目录产生冲突

### 旧 scope 如何兼容

更早的实现只使用一串纯哈希做 scope。当前版本在访问任务时会自动检测旧目录：

- 如果发现旧的纯哈希 scope 存在，而新的 prefixed scope 还不存在
- 会自动把旧的 `scopes/<old-scope>` 迁移到新的 `scopes/<new-scope>`
- 对应的 `logs/<old-scope>` 也会一起迁移

这意味着已有任务不会因为 scope 命名变更而丢失。

## 快速开始

### 示例 1：每天早上 9 点生成代码日报

在 OpenCode 会话里说：

```text
请在当前项目创建一个 cron 任务：
- 名称：repo-daily-report
- cron：0 9 * * *
- 时区：Asia/Shanghai
- 模式：cli
- 超时：180 秒
- 任务：检查最近 24 小时的代码变更，输出新增文件、修改文件、潜在风险和建议关注点
```

### 示例 2：立即执行一次

```text
立即运行刚才那个任务。
```

### 示例 3：查看日志

```text
查看刚才那个任务的日志。
```

## 工具说明

### `cronjob`

当前支持的动作：

- `create`
- `list`
- `get`
- `update`
- `pause`
- `resume`
- `run`
- `remove`

常见自然语言表达：

- `请在当前项目创建一个每天 9 点执行的 cron 任务，生成代码日报。`
- `列出当前项目的所有 cron 任务。`
- `查看任务 <job-id> 的详情。`
- `把任务 <job-id> 改成每 6 小时执行一次。`
- `暂停任务 <job-id>。`
- `恢复任务 <job-id>。`
- `立即运行任务 <job-id>。`
- `删除任务 <job-id>。`

关于查询范围：

- `list` 默认按当前 `workdir` 对应的 scope 查询
- `get`、`pause`、`resume`、`run`、`remove` 也会先在当前 `workdir` 对应的 scope 内查找
- Gateway 调度时才会扫描 `rootDir/scopes` 下的全部 scope

这意味着如果你在不同项目目录里分别执行 `cronjob list`，默认看到的是各自项目的任务，而不是全局所有任务。

### `cron_logs`

按 `jobId` 和 `workdir` 读取日志文本。如果日志文件不存在，会返回空字符串。

## 任务字段

创建或更新任务时，当前实现支持这些关键字段：

- `name`
  任务名称
- `prompt`
  实际要执行的任务内容
- `schedule`
  标准 5 段 cron 表达式
- `timezone`
  IANA 时区名称，例如 `Asia/Shanghai`
- `workdir`
  任务执行目录
- `mode`
  `cli` 或 `attach`
- `attachUrl`
  `attach` 模式连接的 OpenCode 服务地址
- `sessionStrategy`
  `new` 或 `reuse`
- `sessionId`
  `reuse` 模式下复用已有会话
- `agent`
  指定 OpenCode agent
- `providerID` / `modelID`
  指定模型，最终会拼成 `providerID/modelID`
- `skills`
  任务运行时附带的 skills 名称列表
- `timeoutSeconds`
  超时时间，最大 `86400`
- `webhookUrl`
  成功时的投递地址
- `failureWebhookUrl`
  失败时优先使用的投递地址

内部固定策略：

- `status` 初始值为 `enabled`
- `overlapPolicy` 固定为 `skip`
- `catchUpPolicy` 固定为 `skip`
- `backend.kind` 当前固定走 `gateway`

## 执行模式

### `cli`

`cli` 模式会启动新的 `opencode run` 子进程执行任务。

当前行为：

- 默认会自动选择可用命令，优先 `opencode run`，找不到时回退到 `nga run`
- 使用 `run --dangerously-skip-permissions`
- 若配置了 `agent`，会自动附加 `--agent`
- 若配置了 `providerID` 和 `modelID`，会自动附加 `--model providerID/modelID`
- 任务 prompt 会被包装成一次无人值守的一次性执行
- 在 Windows 上超时后会调用 `taskkill /PID <pid> /T /F` 回收整棵进程树

当前 prompt 包装会显式告诉模型：

- 这是一次无人值守执行
- 不会再有后续消息
- 现在就完成任务，不要继续追问
- 不要在任务内部创建新的定时工作
- 只返回最终结果

### `attach`

`attach` 模式通过 `@opencode-ai/sdk` 连接已有的 OpenCode 服务执行任务。

当前行为：

- `attachUrl` 必填
- `sessionStrategy` 为 `reuse` 且存在 `sessionId` 时，会复用会话
- 否则会创建新会话，标题形如 `cron:<job-name>`
- 会把 `cronjob` 工具禁用掉，避免任务内部再次创建定时任务

## 立即执行与轮询执行的区别

- `create`、`resume`、启用后的 `update` 会确保 Gateway 基础设施在线
- Gateway 负责按 `nextRunAt` 轮询执行任务
- `run` 会直接调用 Runner 立即执行，不等待下一个轮询周期

这意味着你可以先创建任务，再手动 `run` 一次做验收，然后让 Gateway 在后续按计划调度。

## Gateway 命令

### 查看状态

```bash
opencode-cron-gateway status --root <rootDir>
```

### 前台运行 Gateway

```bash
opencode-cron-gateway serve --root <rootDir>
```

### 安装自启动

```bash
opencode-cron-gateway install-service --root <rootDir>
```

### 卸载自启动

```bash
opencode-cron-gateway uninstall-service --root <rootDir>
```

Gateway 额外支持这些参数：

- `--command <cmd>`
  指定 `cli` 模式下调用的 OpenCode 命令
- `--gateway-command <cmd>`
  指定 Gateway 自举命令
- `--poll-ms <ms>`
  指定轮询间隔

## Runner 命令

```bash
opencode-cron-runner run --scope <scope> --job <job-id> [--root <dir>] [--command <cmd>]
```

这个命令适合做底层调试，等价于手动让 Runner 执行某个任务。

## Manage 命令

```bash
opencode-cron-manage <rootDir> <scope>
```

它会直接打印该 scope 下的任务 JSON 列表，适合快速排查存储层状态。

## 数据目录与文件结构

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

这些文件的作用：

- `jobs/*.json`
  保存任务定义
- `runs/*.jsonl`
  保存每次执行的记录，包含开始时间、结束时间、状态、退出码、原因、会话 ID
- `locks/*.lock.json`
  防止同一任务并发执行
- `logs/*.log`
  保存任务文本输出
- `gateway/runtime.json`
  保存 Gateway 心跳、PID、活跃任务列表
- `gateway/gateway.log`
  保存 Gateway 自身启动和运行日志

关于 scope 目录名：

- `scopes/<scope>` 和 `logs/<scope>` 一一对应
- 同一个 `workdir` 下的任务会落到同一个 scope 目录
- 不同项目目录即使任务名相同，也会被分到不同 scope

## 平台自启动策略

当前 Gateway 安装自启动的方式如下：

- Windows
  写入 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- macOS
  写入 `~/Library/LaunchAgents/ai.opencode.cron.gateway.plist`
- Linux
  写入 `~/.config/systemd/user/opencode-cron-gateway.service`

插件在需要时会先安装这些基础设施；如果检测到 `runtime.json` 不存在或心跳已经过旧，还会补一个 detached Gateway 进程做自举。

## 日志、运行记录与 Webhook

### 本地日志

每次任务执行完成后，Runner 会把文本输出追加到：

```text
logs/<scope>/<jobId>.log
```

### 运行记录

每次执行还会追加一条 JSONL 记录到：

```text
scopes/<scope>/runs/<jobId>.jsonl
```

运行记录会包含：

- `id`
- `jobId`
- `scope`
- `startedAt`
- `finishedAt`
- `status`
- `exitCode`
- `reason`
- `sessionId`

### Webhook

当 `delivery.mode` 为 `webhook` 时，会发送一个 `POST` 请求，JSON 载荷包含：

- `jobId`
- `jobName`
- `status`
- `reason`
- `output`
- `sessionId`
- `exitCode`
- `timestamp`

如果任务失败且配置了 `failureWebhookUrl`，失败通知会优先投递到它；否则回退到 `webhookUrl`。

## 常见问题

### 为什么 `scopes` 目录下面不是直接用项目绝对路径

因为绝对路径不适合直接做目录名：

- 路径里可能包含盘符、空格、特殊字符和不同平台分隔符
- 目录名过长会影响可读性和兼容性
- 同名目录仍需要额外机制保证唯一性

所以当前实现采用“可读前缀 + 稳定哈希”的形式，兼顾可读性和稳定唯一性。

### 为什么当前项目 `list` 看不到别的项目任务

因为 `cronjob list` 默认按当前 `workdir` 对应的 scope 查询。这是有意为之，目的是让你在项目 A 里只看到项目 A 的任务，避免和项目 B 混在一起。

如果你想做全局巡检，可以直接查看 `rootDir/scopes` 目录，或者用 `opencode-cron-manage` 指定某个 scope 做排查。

### 任务创建成功，但没有按时执行

建议按这个顺序检查：

1. 执行 `opencode-cron-gateway status --root <rootDir>` 看是否有最新心跳。
2. 查看 `gateway/runtime.json` 中的 `updatedAt` 和 `activeJobIds`。
3. 打开任务定义文件，确认 `nextRunAt` 是否正确。
4. 查看 `logs/<scope>/<jobId>.log` 是否有输出。
5. 查看 `scopes/<scope>/runs/<jobId>.jsonl` 是否有记录。

### 任务被跳过了

当前重叠策略固定为 `skip`。如果某个任务上一次还没跑完，新一轮执行会被记为：

- `status: "skipped"`
- `reason: "overlap"`

### 任务超时后没有完全退出

在 Windows 上，当前实现已经会对超时的 `cli` 任务执行：

```text
taskkill /PID <pid> /T /F
```

如果你的任务又启动了额外的外部守护进程，仍建议在 prompt 中明确限制执行边界和输出目标。

### 删除任务后日志还在

`remove` 当前只删除任务定义和锁文件，不会主动清理历史日志和运行记录。

## 当前限制

- 暂不支持自动重试和退避
- 暂不支持 missed run 补跑
- 暂不支持并行策略自定义，当前固定 `skip`
- `remove` 不会自动清理历史 `runs` 和 `logs`
- 仓库中的 `src/backend/*` 属于历史实现保留代码，当前对外主链路已经统一走 Gateway 模式

## 开发与验证

```bash
npm install
npm run build
npm test
```

如果你想看更细的实现设计，请继续阅读：[opencode-cron.md](opencode-cron.md)
