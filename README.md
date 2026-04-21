# opencode-cron

`opencode-cron` 是一个配合 OpenCode 使用的定时任务插件。你可以通过自然语言创建、查询、更新、暂停、恢复、立即执行和删除定时任务；真正的调度由常驻 Gateway 统一完成，任务定义、日志、运行记录和锁文件都会持久化到本地。

它适合这些场景：

- 每天定时检查代码仓库并生成日报
- 周期性运行巡检、回归、质量检查或信息收集任务
- 在固定时间触发 AI 任务，并保留完整日志和运行历史
- 在不同项目目录之间隔离管理各自的定时任务

当前公开 npm 包名：

- `@love-ai/opencode-cron`

如果你的公司内部镜像、私仓或二次开发环境里使用的是别名包：

- `@love-ui/opencode-cron`

两者的插件能力一致，文档下面会同时给出配置示例。

## 安装与启用

推荐方式不是全局安装，也不是手工部署单独服务，而是把插件声明写进 `~/.config/opencode/opencode.json`，由 OpenCode 在启动时自动安装、加载和更新。

公司内部环境示例：

```json
{
  "plugin": [
    "@love-ui/opencode-cron@latest"
  ]
}
```

公开 npm 环境示例：

```json
{
  "plugin": [
    "@love-ai/opencode-cron@latest"
  ]
}
```

启用流程如下：

1. 编辑 `~/.config/opencode/opencode.json`
2. 在 `plugin` 数组中加入插件包名
3. 重启 OpenCode
4. OpenCode 启动时会自动安装或更新该插件
5. 插件加载成功后，会暴露 `cronjob` 和 `cron_logs` 两个工具

如果你只是正常使用插件，不需要手工执行 `npm install -g`，也不需要自己常驻启动 Gateway。插件会在需要时自动准备 Gateway 基础设施。

## 这和全局安装有什么区别

推荐的使用模型是“由 OpenCode 管理插件生命周期”，而不是“用户手工把一个命令行工具装到全局环境里”。

这样做的好处是：

- 安装入口统一，跟随 OpenCode 一起使用
- 升级简单，只需要保留 `@latest` 或指定版本号
- 新机器初始化更容易，不需要额外记忆全局安装步骤
- 插件版本和 OpenCode 实际加载的版本更一致

全局安装只适合开发者本地调试、排障或独立验证包内容，不是推荐的日常使用方式。

## 核心能力

- 通过 `cronjob` 工具完成 `create`、`list`、`get`、`update`、`pause`、`resume`、`run`、`remove`
- 通过 `cron_logs` 工具读取任务日志
- 支持 `cli` 和 `attach` 两种执行模式
- 支持 `agent`、`providerID`、`modelID`、`skills`、`timeoutSeconds`
- 支持本地日志、JSONL 运行记录和 Webhook 投递
- 支持 Windows、macOS、Linux 的 Gateway 自启动
- 支持按项目目录隔离任务 scope，避免不同仓库互相混淆

## 工作方式

当前实现不是“每个任务各装一个系统定时器”，而是统一交给一个常驻 Gateway：

1. OpenCode 通过插件工具创建或管理任务
2. 任务定义写入本地 `rootDir/scopes/<scope>/jobs`
3. 插件在需要时确保 Gateway 基础设施在线
4. Gateway 按固定间隔轮询所有 scope 下的任务
5. 到期任务交给 Runner 执行
6. 执行结果写入日志、运行记录和任务状态
7. 如果配置了 Webhook，再向外部系统投递结果

这种方式的优点是任务数量多时更稳定，也更容易保留日志、锁和运行状态。

## 快速开始

### 1. 创建一个日报任务

在 OpenCode 会话里直接说：

```text
请在当前项目创建一个 cron 任务：
- 名称：repo-daily-report
- cron：0 9 * * *
- 时区：Asia/Shanghai
- 模式：cli
- 超时：180 秒
- 任务：检查最近 24 小时的代码变更，输出新增文件、修改文件、潜在风险和建议关注点
```

### 2. 立即执行一次任务

```text
立即运行刚才那个任务。
```

### 3. 查看任务列表

```text
列出当前项目的所有 cron 任务。
```

### 4. 查看执行日志

```text
查看刚才那个任务的日志。
```

## 工具说明

### `cronjob`

当前支持这些动作：

- `create`
- `list`
- `get`
- `update`
- `pause`
- `resume`
- `run`
- `remove`

常见自然语言表达：

- `请在当前项目创建一个每天上午 9 点执行的 cron 任务，生成代码日报`
- `列出当前项目的所有 cron 任务`
- `查看任务 <job-id> 的详情`
- `把任务 <job-id> 改成每 6 小时执行一次`
- `暂停任务 <job-id>`
- `恢复任务 <job-id>`
- `立即运行任务 <job-id>`
- `删除任务 <job-id>`

查询范围说明：

- `cronjob list` 默认只查询当前 `workdir` 对应的 scope
- `get`、`pause`、`resume`、`run`、`remove` 也会优先在当前 `workdir` 对应 scope 中解析任务
- 只有 Gateway 调度时，才会扫描 `rootDir/scopes` 下的全部 scope

这意味着你在不同项目目录里执行 `cronjob list`，默认看到的是各自项目的任务，而不是全局所有任务混在一起。

### `cron_logs`

`cron_logs` 根据 `jobId` 和 `workdir` 解析 scope，并读取对应日志文本。日志文件不存在时会返回空字符串。

## 执行模式

### `cli`

`cli` 模式会启动一个新的命令行子进程来执行任务，内部等价于调用：

- `opencode run`
- 或在找不到 `opencode` 时自动回退到 `nga run`

当前默认行为：

- `defaultCommand` 默认值是 `auto`
- 当环境里存在 `opencode` 时，优先使用 `opencode run`
- 当环境里没有 `opencode`、但存在 `nga` 时，自动回退为 `nga run`
- 如果任务显式配置 `backend.command: "nga"`，则优先尝试 `nga`，找不到时再回退 `opencode`

这意味着在公司内部只有 `nga`、没有原始 `opencode` 命令的环境中，任务仍然可以正常触发和执行。

### `attach`

`attach` 模式通过 `@opencode-ai/sdk` 连接一个已有的 OpenCode 服务来执行任务。适合需要复用现有服务端会话或使用 attach 链路的场景。

当前行为：

- `attachUrl` 为必填
- `sessionStrategy` 为 `reuse` 且提供了 `sessionId` 时，会复用已有会话
- 否则会新建会话，标题类似 `cron:<job-name>`
- 执行时会禁用 `cronjob` 工具，避免任务内部再次创建定时任务

## Scope 说明

### 为什么需要 scope

`opencode-cron` 的任务、日志、运行记录和锁文件都统一放在 `rootDir` 下，而不是直接写回各个项目仓库。

如果没有 scope，会出现几个问题：

- 不同项目里的任务可能重名
- 日志、运行记录和锁容易混在一起
- 在项目 A 中执行 `list` 时，很难只看到项目 A 自己的任务
- 调度状态和排障信息也缺少项目隔离

所以 scope 的作用就是把“同一个 `workdir` 下的任务”归到同一个逻辑分组里。

### scope 怎么生成

当前规则：

```text
scope-<目录名slug>-<16位稳定哈希>
```

例如工作目录：

```text
L:\Data\opencode-corn
```

生成出来的 scope 会类似：

```text
scope-opencode-corn-<16位哈希>
```

这样做的好处是：

- 前缀固定为 `scope-`
- 中间部分能直接看出项目目录名，便于人工识别
- 最后仍保留稳定哈希，避免同名目录碰撞

### 旧 scope 如何兼容

早期实现只使用纯哈希作为 scope。当前版本会在访问任务时自动检测旧目录：

- 如果发现旧的纯哈希 scope 存在
- 且新的带前缀 scope 还不存在
- 会自动把 `scopes/<old-scope>` 迁移到 `scopes/<new-scope>`
- `logs/<old-scope>` 也会一起迁移

因此已有任务不会因为 scope 命名升级而丢失。

## 数据目录结构

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

这些文件的含义：

- `jobs/*.json`：任务定义
- `runs/*.jsonl`：每次执行的运行记录
- `locks/*.lock.json`：防止同一任务并发执行
- `logs/*.log`：任务的文本输出日志
- `gateway/runtime.json`：Gateway 心跳、PID 和活跃任务信息
- `gateway/gateway.log`：Gateway 自身日志

## 插件可选配置

插件当前支持以下可选项：

- `rootDir`
  默认值：`~/.config/opencode/cron`
- `defaultCommand`
  默认值：`auto`
- `gatewayCommand`
  默认值：`opencode-cron-gateway`
- `gatewayPollIntervalMs`
  默认值：`30000`

含义说明：

- `rootDir`：所有任务、日志、运行记录和 Gateway 状态文件的根目录
- `defaultCommand`：`cli` 模式下实际使用的命令，默认自动在 `opencode` 和 `nga` 之间探测
- `gatewayCommand`：插件自举 Gateway 时使用的命令名
- `gatewayPollIntervalMs`：Gateway 轮询任务的间隔，单位毫秒

如果你的 OpenCode 运行环境支持带 options 的插件声明，可以把这些值作为插件参数传入；不配置时直接使用默认值即可。

## 日志、运行记录与 Webhook

### 本地日志

任务每次执行完成后，Runner 会把文本输出追加到：

```text
logs/<scope>/<jobId>.log
```

### 运行记录

每次执行还会追加一条 JSONL 记录到：

```text
scopes/<scope>/runs/<jobId>.jsonl
```

记录字段包括：

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

当交付模式为 `webhook` 时，会向外部发送 JSON `POST`，载荷包含：

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

### 为什么我没有全局安装包，也能使用它

因为推荐方式是由 OpenCode 按 `opencode.json` 中的 `plugin` 配置自动安装和加载插件，而不是依赖全局 npm 安装。

### 为什么当前项目里 `cronjob list` 看不到别的项目任务

因为 `cronjob list` 默认按当前 `workdir` 对应的 scope 查询。这是刻意设计的项目隔离行为。

### 任务创建成功了，但没有按时执行

建议按这个顺序排查：

1. 确认 OpenCode 已成功加载该插件
2. 查看 `gateway/runtime.json` 是否持续更新
3. 检查任务定义中的 `nextRunAt` 是否正确
4. 检查 `logs/<scope>/<jobId>.log` 是否有输出
5. 检查 `scopes/<scope>/runs/<jobId>.jsonl` 是否有运行记录

### 公司内部只有 `nga`，没有 `opencode`，还能不能跑

可以。当前默认会自动探测命令：

- 优先 `opencode`
- 不存在时回退 `nga`

因此只要环境里有可执行的 `nga run`，`cli` 模式也能正常触发任务。

## 开发与验证

如果你在当前仓库里做本地开发或调试，可以使用：

```bash
npm install
npm run build
npm test
```

如果你想检查发布产物：

```bash
npm pack --dry-run
```

如果你想了解更完整的实现设计，请继续阅读 [opencode-cron.md](opencode-cron.md)。
