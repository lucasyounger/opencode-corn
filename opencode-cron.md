# opencode-cron 详细设计文档

## 1. 设计目标

`opencode-cron` 的目标是为 OpenCode 提供一套稳定、可持久化、可观测的定时任务机制。

核心目标：

- 允许用户通过自然语言创建定时任务
- 将任务定义持久化到本地文件系统
- 由一个常驻 Gateway 统一调度所有任务
- 支持日志、运行记录、锁和下一次运行时间的完整维护
- 尽量减少对系统级定时器数量的依赖

非目标：

- 当前版本不负责复杂的失败重试编排
- 当前版本不做 missed run catch-up
- 当前版本不做分布式调度

## 2. 当前架构总览

### 2.1 部署模型

`opencode-cron` 的推荐部署方式不是全局 `npm install -g`，而是作为 OpenCode 插件交给 OpenCode 自身管理。

典型做法是在：

```text
~/.config/opencode/opencode.json
```

中声明插件，例如：

```json
{
  "plugin": [
    "@love-ui/opencode-cron@latest"
  ]
}
```

如果使用公开 npm 包，则包名对应为：

```json
{
  "plugin": [
    "@love-ai/opencode-cron@latest"
  ]
}
```

OpenCode 启动时会自动安装、加载并更新插件，因此对最终用户来说，它更像是“OpenCode 的一个能力扩展”，而不是一个需要单独全局部署的系统命令。

这也意味着：

- 日常使用时不要求用户手工执行全局安装
- Gateway、Runner 等能力由插件包内命令提供，但生命周期由 OpenCode 驱动
- 文档中的全局命令更适合开发、调试和排障场景，而不是主使用路径

当前主链路不是“每个任务安装一个系统 cron/schtasks 项”，而是：

1. 插件工具接收任务管理请求
2. 任务定义写入 `rootDir/scopes/<scope>/jobs`
3. 插件确保 Gateway 启动基础设施存在
4. Gateway 常驻运行并按固定轮询间隔扫描任务
5. 到期任务由 Runner 执行
6. 执行结果写入 run record、文本日志和任务状态
7. 如配置 Webhook，则向外部系统投递结果

核心模块：

- 插件入口：[src/index.ts](src/index.ts)
- 任务工具：[src/plugin/cronjob-tool.ts](src/plugin/cronjob-tool.ts)
- 日志工具：[src/plugin/logs-tool.ts](src/plugin/logs-tool.ts)
- Gateway 控制：[src/gateway/control.ts](src/gateway/control.ts)
- Gateway Runtime：[src/gateway/runtime.ts](src/gateway/runtime.ts)
- Runner：[src/core/runner.ts](src/core/runner.ts)
- 存储：[src/store/job-store.ts](src/store/job-store.ts)
- 锁：[src/store/lock.ts](src/store/lock.ts)

## 3. 插件层设计

### 3.1 插件入口

插件入口定义在 [src/index.ts](src/index.ts)。

它导出两个工具：

- `cronjob`
- `cron_logs`

此外，插件会监听 `session.error` 事件，并通过 `input.client.app.log()` 写入插件级错误日志。

在部署层面，插件本身预期由 OpenCode 在启动阶段装载。也就是说，用户通常只需要在 `opencode.json` 中声明插件包名，不需要额外创建 `.opencode/plugins/*.ts` 转发文件，更不需要单独全局安装插件再接入 OpenCode。

### 3.2 `cronjob` 工具

`cronjob` 是主入口，定义在 [src/plugin/cronjob-tool.ts](src/plugin/cronjob-tool.ts)。

它支持以下动作：

- `create`
- `list`
- `get`
- `update`
- `pause`
- `resume`
- `run`
- `remove`

动作行为：

- `create`：创建任务、写入存储，并确保 Gateway 在线
- `list`：列出当前 `workdir` 对应 scope 下的任务
- `get`：读取当前 `workdir` 对应 scope 下的指定任务
- `update`：更新任务并重算 `nextRunAt`
- `pause`：将状态改为 `paused`
- `resume`：恢复任务并重算 `nextRunAt`
- `run`：立即调用 Runner 执行，不等待 Gateway 轮询
- `remove`：删除任务定义和锁文件

这里的关键点是：插件层的绝大多数任务管理动作都不是“扫描全局所有任务”，而是先根据 `workdir` 解析出当前 scope，再在这个 scope 里操作任务。这样用户在某个项目目录中发出 `list`、`get`、`pause`、`resume`、`run`、`remove` 时，默认只会命中当前项目的任务集合。

### 3.3 `cron_logs` 工具

`cron_logs` 定义在 [src/plugin/logs-tool.ts](src/plugin/logs-tool.ts)。

职责非常单一：

- 根据 `jobId` 和 `workdir` 解析出对应 scope
- 读取日志文件并原样返回
- 文件不存在时返回空字符串

## 4. 数据模型

核心结构定义在 [src/core/types.ts](src/core/types.ts)，校验规则定义在 [src/core/schema.ts](src/core/schema.ts)。

### 4.1 `CronJob`

任务定义包含这些关键字段：

- `id`：任务 ID
- `name`：任务名
- `prompt`：原始任务内容
- `schedule`：cron 表达式
- `timezone`：时区
- `workdir`：工作目录
- `status`：`enabled` 或 `paused`
- `mode`：`cli` 或 `attach`
- `sessionStrategy`：`new` 或 `reuse`
- `agent` / `model` / `skills`：执行配置
- `timeoutSeconds`：超时时间
- `delivery`：日志模式或 Webhook 模式
- `backend`：当前主链路固定为 `gateway`
- `createdAt` / `updatedAt` / `lastRunAt` / `nextRunAt`

### 4.2 `JobRunRecord`

每次执行会生成一条运行记录：

- `id`
- `jobId`
- `scope`
- `startedAt`
- `finishedAt`
- `status`
- `exitCode`
- `reason`
- `sessionId`

## 5. 任务创建与更新流程

任务创建和更新逻辑都在 [src/plugin/cronjob-tool.ts](src/plugin/cronjob-tool.ts)。

### 创建流程

1. 校验 `name`、`prompt`、`schedule`
2. 归一化 `workdir`
3. 根据 `workdir` 计算首选 scope
4. 组装 `CronJob`
5. 通过 `computeNextRun()` 计算 `nextRunAt`
6. 写入 `jobs/<jobId>.json`
7. 调用 `ensureGatewayInfrastructure()`

### 更新流程

1. 加载现有任务
2. 合并可更新字段
3. 更新时间戳
4. 如果 `workdir` 改变，则重新解析目标 scope
5. 重新计算 `nextRunAt`
6. 如果任务仍为 `enabled`，再次确保 Gateway 在线

## 6. Gateway 启动基础设施

Gateway 基础设施入口位于 [src/gateway/control.ts](src/gateway/control.ts)。

当前逻辑包含两层：

1. 安装平台级自动启动配置
2. 如果当前没有健康的 Gateway Runtime，则额外自举一个 detached Gateway 进程

### 6.1 自动启动配置

平台选择由 [src/gateway/service-manager.ts](src/gateway/service-manager.ts) 决定：

- Windows：`WindowsGatewayServiceManager`
- macOS：`LaunchdGatewayServiceManager`
- Linux：`LinuxSystemdGatewayServiceManager`

各平台实现：

- Windows：[src/gateway/service/windows.ts](src/gateway/service/windows.ts)
- macOS：[src/gateway/service/launchd.ts](src/gateway/service/launchd.ts)
- Linux：[src/gateway/service/linux-systemd.ts](src/gateway/service/linux-systemd.ts)

Windows 当前使用 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`，值名为 `OpenCodeCronGateway`。

### 6.2 自举逻辑

如果 `runtime.json` 不存在，或者心跳过旧，`ensureGatewayInfrastructure()` 会：

- 解析 Gateway 启动命令
- 准备 `gateway.log`
- 以 detached 子进程方式启动 `gateway.js serve`

## 7. Gateway Runtime

Gateway Runtime 位于 [src/gateway/runtime.ts](src/gateway/runtime.ts)。

### 7.1 核心职责

- 读取所有 scope 下的任务
- 选出已到期任务
- 维护运行中任务集合 `inFlight`
- 写入 `gateway/runtime.json` 心跳
- 调用 Runner 执行到期任务

### 7.2 到期判定

当前判定逻辑非常直接：

- 任务状态必须为 `enabled`
- 若 `nextRunAt` 为空，则视为到期
- 若 `nextRunAt <= now`，则视为到期

### 7.3 Runtime 健康判定

`isGatewayRuntimeFresh()` 会读取 `runtime.updatedAt`，并结合 `pollIntervalMs` 计算最大允许延迟，用于判断当前是否已有健康的 Gateway 在运行。

## 8. Runner 设计

执行逻辑位于 [src/core/runner.ts](src/core/runner.ts)。

Runner 支持两种模式：

- `cli`
- `attach`

### 8.1 通用流程

1. 加载任务定义
2. 获取任务级锁
3. 执行任务
4. 生成 `JobRunRecord`
5. 更新任务的 `lastRunAt`、`nextRunAt`、`updatedAt`
6. 写日志、写 run record、写回任务定义、触发交付
7. 释放锁

如果任务锁已经存在且对应进程仍存活，则当前执行被标记为 `skipped`，原因是 `overlap`。

### 8.2 `cli` 模式

`cli` 模式会：

- 用 [src/core/prompt.ts](src/core/prompt.ts) 包装任务 prompt
- 用 [src/core/process.ts](src/core/process.ts) 组装 `opencode run` 参数
- 默认优先探测 `opencode`，若当前环境不存在，则自动回退到 `nga`
- 在配置了 `agent` / `model` 时传给 CLI
- 收集 stdout/stderr
- 根据退出码和超时情况决定 `success` / `failed`

当前 prompt 包装策略强调：

- 这是一次无人值守执行
- 不会再有后续消息
- 任务应立即完成而不是继续追问
- 返回最终结果即可

### 8.3 Windows 超时回收

在 Windows 上，如果 `cli` 模式超时，Runner 会调用：

```text
taskkill /PID <pid> /T /F
```

这保证不仅主进程会被回收，整棵子进程树也会被回收，避免 lock 长时间残留。

### 8.4 `attach` 模式

`attach` 模式通过 `@opencode-ai/sdk` 连接现有 OpenCode 服务：

1. 用 `attachUrl` 建立客户端
2. 根据 `sessionStrategy` 选择复用或创建会话
3. 发送 prompt
4. 禁用 `cronjob` 工具，避免任务内部再次创建定时任务
5. 将返回 parts 拼接为输出文本

## 9. Prompt 组装

Prompt 包装逻辑位于 [src/core/prompt.ts](src/core/prompt.ts)。

结构分为三部分：

1. 无人值守执行约束
2. `skills` 列表（如果存在）
3. 原始任务正文

目的是让 OpenCode 在定时任务环境里尽量直接完成工作，而不是进入普通对话流程。

## 10. 结果投递

结果投递逻辑位于 [src/core/delivery.ts](src/core/delivery.ts)。

当前支持：

- `log`：只写本地日志
- `webhook`：向外部地址发送 JSON POST

发送内容包括：

- `jobId`
- `jobName`
- `status`
- `reason`
- `output`
- `sessionId`
- `exitCode`
- `timestamp`

失败时优先使用 `failureWebhookUrl`，否则回退到 `webhookUrl`。

## 11. 存储模型

持久化由 [src/store/job-store.ts](src/store/job-store.ts) 实现。

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

### 11.1 Scope

Scope 由 `workdir` 计算得出，用来隔离不同项目目录下的任务集合。

为什么需要 scope：

- 所有任务、日志、运行记录和锁都统一落在 `rootDir` 下
- 如果没有 scope，不同项目的任务会直接混在一起
- 任务名、日志、运行记录和锁文件都容易冲突
- 用户在某个项目里执行 `list` 时，也无法自然地只看到“当前项目的任务”

因此，scope 是“全局存储 + 项目隔离”之间的桥梁。

当前 scope 的生成方式位于 [src/utils/paths.ts](src/utils/paths.ts)，规则是：

```text
scope-<目录名slug>-<16位稳定哈希>
```

细节如下：

1. 先把 `workdir` 展开 `~` 并归一化成绝对路径
2. 再转成小写，确保大小写差异不会影响 scope 稳定性
3. 取最后一级目录名做 slug，提升可读性
4. 再拼接旧算法中的 16 位稳定哈希，保证唯一性

例如工作目录：

```text
L:\Data\opencode-corn
```

对应 scope 会类似：

```text
scope-opencode-corn-<16位哈希>
```

### 11.2 旧 scope 兼容与迁移

早期实现的 scope 只有纯哈希，不带可读前缀。当前版本为了兼顾可读性和兼容性，在 [src/store/job-store.ts](src/store/job-store.ts) 中加入了自动迁移逻辑：

- 访问某个 `workdir` 时，会同时计算新 scope 和旧 scope
- 如果发现旧的纯哈希目录存在，而新的 prefixed 目录尚不存在
- 会自动把 `scopes/<old-scope>` 重命名为 `scopes/<new-scope>`
- 如果 `logs/<old-scope>` 存在，也会一起迁移到 `logs/<new-scope>`

这样已有任务不会因为命名规则升级而“丢失”。

### 11.3 任务存储

- `upsertJob()`：写任务定义
- `getJob()`：读单个任务
- `listJobs()`：列出当前 scope 下任务
- `deleteJob()`：删除任务和任务锁

插件层与存储层的对应关系是：

- `cronjob list` 默认只读当前 `workdir` 解析出的 scope
- `cronjob get/update/pause/resume/run/remove` 也优先在当前 scope 内解析任务
- `JobStore.listAllJobs()` 则会扫描 `rootDir/scopes` 下的全部 scope，供 Gateway 统一调度时使用

也就是说，用户视角是“按当前项目隔离”，调度器视角才是“全局扫描所有 scope”。

### 11.4 运行记录

`appendRun()` 会把每次执行记录追加到 `runs/<jobId>.jsonl`。

## 12. 锁设计

锁逻辑位于 [src/store/lock.ts](src/store/lock.ts)。

### 12.1 任务锁

每个任务执行前都要尝试获取 `locks/<jobId>.lock.json`。

锁文件内容包含：

- `acquiredAt`
- `pid`

如果锁文件存在但 PID 对应进程已不存在，则会删除 stale lock 后重新加锁。

### 12.2 Gateway 全局锁

Gateway 自身也有一把全局锁，路径在 `gateway/gateway.lock.json`，防止同一 rootDir 同时跑多个 Gateway。

## 13. 时间计算

`nextRunAt` 的计算位于 [src/utils/time.ts](src/utils/time.ts)。

当前使用 `cron-parser`：

- 输入 cron 表达式
- 输入时区
- 基于当前时间计算下一个执行点
- 最终统一存储为 ISO 时间字符串

## 14. 平台启动策略

### Windows

- 注册表 `Run` 自启动
- 通过 `resolveWindowsGatewayLauncher()` 生成完整命令行
- 默认值名：`OpenCodeCronGateway`

### macOS

- 写入 `~/Library/LaunchAgents/ai.opencode.cron.gateway.plist`
- 设置 `KeepAlive` 与 `RunAtLoad`

### Linux

- 写入 `~/.config/systemd/user/opencode-cron-gateway.service`
- 使用 `systemctl --user enable/restart`

## 15. 遗留实现说明

仓库里仍保留了 [src/backend](src/backend) 目录，包含：

- `LinuxCronBackend`
- `WindowsTaskSchedulerBackend`
- `LaunchdBackend`

它们代表较早期“直接写系统调度”的实现思路，但当前插件主链路已经不再调用这组后端。当前真正生效的是 Gateway 调度模式。

因此，文档和对外使用说明应优先以 Gateway 架构为准。

## 16. 当前限制与后续建议

当前版本仍有这些限制：

- 没有自动重试与退避
- 没有 missed run catch-up
- `remove` 不会主动清除历史日志和运行记录
- 对于复杂 prompt，OpenCode 的实际执行表现仍可能受到环境内其它插件和 agent 配置影响

后续建议优先级：

1. 增加更稳定的集成测试，覆盖真实 `opencode run`
2. 在 README 中补充更多 prompt 编写建议
3. 为运行记录增加更多诊断字段
4. 明确 legacy backend 的弃用策略
