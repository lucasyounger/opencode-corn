# opencode-corn 详细设计文档

## 1. 概述

opencode-corn 是一个面向 OpenCode 的定时任务插件。它的目标不是把调度塞进每个任务对应的 OS 定时器，而是提供一个常驻 Gateway 进程，由 Gateway 统一扫描任务、判断到期、执行任务，并把执行结果和状态持久化到本地文件系统。

当前实现的核心设计点：

- OpenCode 暴露两个工具：cronjob 和 cron_logs
- 任务按 workdir 做 scope 隔离
- 调度逻辑运行在常驻 Gateway 进程内
- OS 只负责自启动 Gateway，而不负责逐任务调度
- 任务定义、运行记录、日志、锁文件都存储在本地
- 任务执行支持 cli 和 attach 两种模式

相关代码入口：

- 插件入口：[src/index.ts](L:/Data/opencode-corn/src/index.ts:5)
- 任务工具：[src/plugin/cronjob-tool.ts](L:/Data/opencode-corn/src/plugin/cronjob-tool.ts:34)
- 日志工具：[src/plugin/logs-tool.ts](L:/Data/opencode-corn/src/plugin/logs-tool.ts:7)
- Gateway Runtime：[src/gateway/runtime.ts](L:/Data/opencode-corn/src/gateway/runtime.ts:48)
- 执行器：[src/core/runner.ts](L:/Data/opencode-corn/src/core/runner.ts:13)

## 2. 设计目标

### 2.1 目标

- 给 OpenCode 增加可对话创建和管理定时任务的能力
- 任务在不同项目之间天然隔离，避免互相污染
- 电脑重启后能够自动恢复 Gateway
- 调度不依赖每个 job 一个 OS scheduler entry
- 本地排障成本低，文件可直接查看
- 先做轻量实现，再逐步向 Gateway runtime 形态演进

### 2.2 非目标

- 当前版本不是分布式调度系统
- 当前版本不提供多节点协调
- 当前版本不保证系统级 service 安装
- 当前版本不提供复杂 retry、backoff、dead-letter 机制
- 当前版本不提供基于数据库的中心化状态管理

## 3. 架构总览

系统由 5 个主要部分组成：

1. OpenCode 插件层
2. Gateway 常驻调度层
3. Job Runner 执行层
4. 本地持久化层
5. OS 自启动适配层

整体流程：

1. 用户在 OpenCode 中通过自然语言发起定时任务请求
2. cronjob 工具将任务持久化到本地 scope 存储
3. 插件确保 Gateway 自启动配置存在，并尽量拉起 Gateway
4. Gateway 周期性扫描所有 scope 中的任务
5. 到期任务由 Runner 执行
6. 执行结果写入 runs、logs，并更新任务元数据

## 4. 模块设计

### 4.1 插件入口

插件入口定义在 [src/index.ts](L:/Data/opencode-corn/src/index.ts:5)。

职责：

- 向 OpenCode 注册两个工具：cronjob 和 cron_logs
- 在 session.error 事件发生时写入插件级错误日志

这一层不负责调度，只负责把 OpenCode 的工具调用转成内部服务逻辑。

### 4.2 cronjob 工具

cronjob 是主入口，定义在 [src/plugin/cronjob-tool.ts](L:/Data/opencode-corn/src/plugin/cronjob-tool.ts:34)。

支持动作：

- create
- list
- get
- update
- pause
- resume
- run
- remove

职责：

- 解析和校验用户请求参数
- 计算当前 workdir 的 scope
- 读写任务定义
- 在创建、更新启用、恢复任务时确保 Gateway 可用
- 在手动 run 时直接调用 Runner

设计特点：

- 工具层是同步管理入口，不做后台轮询
- 工具层不直接做 OS scheduler per-job 安装
- 所有任务创建时 backend.kind 固定为 gateway

### 4.3 cron_logs 工具

cron_logs 定义在 [src/plugin/logs-tool.ts](L:/Data/opencode-corn/src/plugin/logs-tool.ts:7)。

职责：

- 根据 jobId 和 workdir 计算 scope
- 找到该任务的日志文件
- 返回日志文本内容

### 4.4 Gateway 控制层

Gateway 控制逻辑定义在 [src/gateway/control.ts](L:/Data/opencode-corn/src/gateway/control.ts:8)。

职责：

- 安装当前平台的 Gateway 自启动配置
- 检查 Gateway 运行心跳
- 如果 Gateway 当前不可用，则以 detached 模式拉起后台进程

### 4.5 Gateway Runtime

Gateway Runtime 定义在 [src/gateway/runtime.ts](L:/Data/opencode-corn/src/gateway/runtime.ts:48)。

职责：

- 持有 Gateway 全局锁，防止重复启动
- 周期性扫描所有 scope 下的任务
- 找出到期任务
- 避免同一任务重复并发执行
- 将到期任务交给 Runner
- 持续写入 Gateway 心跳

运行循环：

1. start() 获取 Gateway 锁
2. 进入 while 循环
3. 调用 tick()
4. tick() 读取全部 jobs
5. 筛选 enabled 且 nextRunAt 小于等于 now 的任务
6. 对每个任务异步调用 runDueJob()
7. 更新 runtime.json
8. sleep 一个轮询周期后继续

### 4.6 Runner 执行层

任务执行逻辑定义在 [src/core/runner.ts](L:/Data/opencode-corn/src/core/runner.ts:13)。

职责：

- 读取 job 定义
- 获取 job 级锁，避免 overlap
- 根据 mode 选择执行方式
- 更新运行记录和下次执行时间
- 写日志
- 触发 webhook 投递

Runner 支持两种执行模式。

cli 模式实现见 [src/core/runner.ts](L:/Data/opencode-corn/src/core/runner.ts:61)。执行方式是启动一个新的 opencode 子进程，调用 opencode run --non-interactive --print。

attach 模式实现见 [src/core/runner.ts](L:/Data/opencode-corn/src/core/runner.ts:100)。执行方式是通过 @opencode-ai/sdk 连接一个现有 OpenCode 服务，创建或复用 session，并把任务 prompt 直接发给对应 session。

### 4.7 Prompt 组装层

Prompt 包装定义在 [src/core/prompt.ts](L:/Data/opencode-corn/src/core/prompt.ts:3)。

职责：

- 在用户原始 prompt 外层包一层定时任务运行上下文
- 注入 skill 列表
- 加入安全约束

## 5. 数据模型

### 5.1 CronJob

结构定义见 [src/core/types.ts](L:/Data/opencode-corn/src/core/types.ts:19)。

核心字段：

- id
- name
- prompt
- schedule
- timezone
- workdir
- status
- mode
- sessionStrategy
- agent
- model
- skills
- timeoutSeconds
- delivery
- backend
- createdAt
- updatedAt
- lastRunAt
- nextRunAt

当前固定策略字段：

- overlapPolicy = skip
- catchUpPolicy = skip

### 5.2 JobRunRecord

定义见 [src/core/types.ts](L:/Data/opencode-corn/src/core/types.ts:41)。

核心字段：

- id
- jobId
- scope
- startedAt
- finishedAt
- status
- exitCode
- reason
- sessionId

### 5.3 Gateway Runtime State

定义见 [src/gateway/types.ts](L:/Data/opencode-corn/src/gateway/types.ts:1)。

字段：

- pid
- hostname
- startedAt
- updatedAt
- pollIntervalMs
- activeJobIds

## 6. 持久化设计

### 6.1 作用域隔离

scope 的计算方式见 [src/utils/paths.ts](L:/Data/opencode-corn/src/utils/paths.ts:19)。

算法：

1. workdir 规范化为绝对路径
2. 转为小写
3. 做 SHA-256
4. 取前 16 个十六进制字符

### 6.2 目录结构

持久化根目录默认是 ~/.config/opencode/cron，定义见 [src/core/schema.ts](L:/Data/opencode-corn/src/core/schema.ts:59)。

目录结构：

- rootDir/gateway/runtime.json
- rootDir/gateway/gateway.lock.json
- rootDir/scopes/<scope>/jobs/<jobId>.json
- rootDir/scopes/<scope>/runs/<jobId>.jsonl
- rootDir/scopes/<scope>/locks/<jobId>.lock.json
- rootDir/logs/<scope>/<jobId>.log

对应代码：

- [src/store/job-store.ts](L:/Data/opencode-corn/src/store/job-store.ts:73)
- [src/gateway/paths.ts](L:/Data/opencode-corn/src/gateway/paths.ts:3)

### 6.3 文件格式

- Job：格式化 JSON
- Runs：JSONL，每次执行 append 一行
- Logs：纯文本 append
- Locks：JSON
- Runtime State：JSON

## 7. 执行流程设计

### 7.1 创建任务

流程：

1. OpenCode 调用 cronjob action=create
2. 工具校验 name、prompt、schedule
3. 根据 workdir 计算 scope
4. 构造 CronJob
5. 写入 jobs/<id>.json
6. 调用 ensureGatewayInfrastructure()

### 7.2 Gateway 启动

流程：

1. 安装当前平台的 Gateway 自启动项
2. 读取 gateway/runtime.json
3. 判断心跳是否仍然新鲜
4. 若无心跳或心跳过期，spawn 一个 detached 后台进程

### 7.3 轮询与到期判断

Gateway 每隔 pollIntervalMs 扫描一次所有 jobs。

到期条件：

- job.status 等于 enabled
- job.nextRunAt 不存在，或 nextRunAt 小于等于 now

### 7.4 单次任务执行

流程：

1. Runner 读取 job
2. 获取 job lock
3. 根据 mode 执行
4. 更新 lastRunAt
5. 计算新的 nextRunAt
6. 写日志和 run record
7. 释放锁

### 7.5 手动立即执行

当用户在 OpenCode 中要求立即运行一次任务时，插件走 cronjob action=run。这会直接调用 Runner，而不是等待 Gateway 下一次扫描。

## 8. 并发与锁设计

### 8.1 Gateway 级锁

Gateway 启动时获取全局锁，避免多个 Gateway 进程同时扫描和执行任务。

### 8.2 Job 级锁

每个任务执行时获取独立 job lock，避免同一任务 overlap。

### 8.3 Stale Lock 回收

锁实现定义在 [src/store/lock.ts](L:/Data/opencode-corn/src/store/lock.ts:1)。当前逻辑会读取锁文件中的 pid，判断进程是否仍然存在；若进程不存在，则删除 stale lock。

## 9. 平台适配设计

当前平台适配层不再负责逐任务调度，只负责 Gateway 自启动。

### 9.1 Windows

实现见 [src/gateway/service/windows.ts](L:/Data/opencode-corn/src/gateway/service/windows.ts:7)。当前策略是使用一个 schtasks 任务，触发方式为 ONLOGON。

### 9.2 macOS

实现见 [src/gateway/service/launchd.ts](L:/Data/opencode-corn/src/gateway/service/launchd.ts:10)。当前策略是写入 LaunchAgent，并设置 KeepAlive 和 RunAtLoad。

### 9.3 Linux

实现见 [src/gateway/service/linux-systemd.ts](L:/Data/opencode-corn/src/gateway/service/linux-systemd.ts:10)。当前策略是使用 systemd --user。

## 10. 可靠性策略

### 10.1 已实现

- 工作目录隔离
- Gateway 单实例锁
- Job 单实例锁
- stale lock 回收
- 心跳文件
- 手动立即执行
- 超时控制
- 执行日志和运行历史

### 10.2 当前已知限制

- 没有 retry/backoff
- 没有 missed-run catch-up
- 没有系统级 service 安装
- 没有任务优先级
- 没有持久化队列
- 没有复杂调度语义抽象

## 11. 与 opencode-scheduler 的关系

参考仓库：[different-ai/opencode-scheduler](https://github.com/different-ai/opencode-scheduler)

相同点：

- 都是 OpenCode 调度插件
- 都按 workdir 做 scope 隔离
- 都把任务元数据保存在本地文件系统
- 都支持自然语言驱动创建任务
- 都强调 no-overlap 和 timeout 这类运行保护

主要差异：

- opencode-scheduler 是 OS 原生调度器驱动任务
- opencode-corn 是 Gateway 常驻进程内调度任务
- opencode-scheduler 的 supervisor 由 OS 触发
- opencode-corn 的执行触发由 Gateway polling 决定

## 12. 运维与排障

### 12.1 查看 Gateway 状态

可以运行：opencode-corn-gateway status

### 12.2 查看任务日志

在 OpenCode 中可以说：读取任务 <job-id> 的日志。

### 12.3 查看本地状态文件

重点排查文件：

- gateway/runtime.json
- scopes/<scope>/jobs/*.json
- scopes/<scope>/runs/*.jsonl
- logs/<scope>/*.log

## 13. 未来演进方向

建议优先级：

1. 支持系统级服务安装
2. 支持 retry / backoff
3. 支持 missed-run catch-up 策略
4. 增加更丰富的状态查询工具
5. 增加全局清理工具
6. 增加结构化输出和更好的 delivery 目标

## 14. 总结

opencode-corn 当前版本的本质是：

- 一个 OpenCode 插件
- 一个常驻 Gateway 调度器
- 一个轻量的本地任务执行系统

它的优势在于架构简单、本地可观测、调度与任务定义解耦，并且更适合继续往 Gateway runtime 演进。当前的边界也很清晰：它仍是单机、文件存储、轻量 runtime，而不是完整的多租户自动化平台。
