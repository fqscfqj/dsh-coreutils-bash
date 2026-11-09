# Coreutils Bash for DeepSeek Harness

[简体中文](README.md) | [English](README.en.md)

这个 Bundle 将 DeepSeek Harness（DSH）在 Windows 上的 PowerShell Shell 替换为由 Microsoft Coreutils 支持的原生 Bash，覆盖一次性命令执行器、四个内置 Agent 预设和持久化终端三条链路。

## 工作原理

Bundle 通过一份 [cordis.patch.yml](cordis.patch.yml) 补丁层接入 DSH 的标准组合流程：

- 禁用根组合中的 `pwsh-sandbox` 执行器（`@deepseek-ai/dsh-pwsh-sandbox`），插入本包的 `coreutils-bash-sandbox` 执行器（`dsh-coreutils-bash/executor`）。执行器继承 `@deepseek-ai/dsh-bash-sandbox` 的全部沙箱语义，只把 argv 换成 `bash.exe --noprofile --norc -c <command>`。
- 重写 `standard`、`ptc`、`cordis`、`minimal` 四个内置预设的 Shell 行：关闭 `tool-pwsh`，启用 `tool-bash`；`minimal` 的持久化 Shell 组改用本包的 `coreutils-bash` PTY 后端。
- 向持久终端组（`optional-persistent-terminals`，来自官方终端 Bundle）注册 `coreutils-bash` 后端；该 Bundle 未启用时此插入被跳过并给出警告，不影响其余功能。
- 每个子进程的 `PATH` 最前面都会加上 Coreutils 命令目录和 bash 所在目录，并设置 `DSH_COREUTILS_BASH=1`、`DSH_COREUTILS_BIN` 两个环境变量。

Harness 现有的沙箱模式、审批流程、超时预算、输出限制、取消机制和进程清理均保持生效。

## 前置要求

- Windows（本 Bundle 只在 Windows 上有意义）。
- Git for Windows 或 MSYS2，提供 `bash.exe`。
- Microsoft Coreutils，可通过 `winget install Microsoft.Coreutils` 安装。
- 通过 CLI 标准流程安装时需要 `pnpm` 在 `PATH` 中。

Microsoft Coreutils 提供的是 `ls`、`cat`、`grep`、`find` 等原生 Windows 工具（基于 uutils），它并不是 Bash 解释器。因此本 Bundle 需要同时安装上述两个组件，并且绝不会静默回退到 PowerShell。

## 安装

本 Bundle 是标准的 DSH 第三方 Bundle（`package.json` 声明 `dsh.bundle.patch`），可通过 DSH 标准安装流程安装：

以下方式走同一条标准安装流程，效果一致：

- **桌面版 / Web 界面**：侧栏「插件」页 → 安装，填入安装 spec，一键完成。
- **Agent 工具**：让 Agent 调用 `plugin_manager` 的 `install_bundle`。
- **CLI**：`dsh plugin add <spec>`（指定 profile 用 `dsh plugin --profile <name> add <spec>`）。

推荐使用 GitHub 仓库 spec 安装，可直接获得最新发布版本。

支持的安装 spec：

| 形式 | 示例 |
| --- | --- |
| 本地目录（绝对路径） | `D:\github\dsh-coreutils-bash` |
| GitHub 仓库 | `github:fqscfqj/dsh-coreutils-bash` |
| Git URL | `git+https://github.com/fqscfqj/dsh-coreutils-bash.git` |

安装即默认启用。安装与启用会作用于该 profile 下的所有会话；`plugin_manager` 工具操作需要 `danger-full-access` 权限或当次审批。若依赖已存在（例如此前以 `link:` 方式手工接入），标准安装会报告 `already-installed`，先移除再安装即可走完整流程。

补充说明：

- 从本地目录安装时以 pnpm `link:` 方式接入，安装日志中的 peer dependencies WARN 属预期现象——这些 peer 由 DSH 运行时自身提供，不影响使用；GitHub / Git URL 安装为复制安装，不会出现该警告。
- 安装是 profile 级配置，已在运行的 DSH 实例需要重启（或新开会话）后才会加载新安装的 Bundle。

### 验证安装

在任意会话的 Bash 工具中执行：

```bash
echo "$DSH_COREUTILS_BASH"; command -v ls; ls --version
```

预期输出 `DSH_COREUTILS_BASH=1`、Coreutils 目录下的 `ls`，以及 `ls (uutils coreutils) …` 版本行。

## 配置

默认解析器会检查常见的 Git for Windows、MSYS2 和 Microsoft Coreutils 安装位置（`C:\Program Files\Git`、`C:\msys64`、`C:\Program Files\coreutils`、`%LOCALAPPDATA%\Programs\coreutils`、scoop 及 `PATH`）。如果安装位置非标准，可以在插件行中覆盖以下字段：

### 执行器（`dsh-coreutils-bash/executor`）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `cwd` | `process.cwd()` | 命令工作目录 |
| `timeoutMs` | `120000` | 单次命令超时 |
| `maxTimeoutMs` | `600000` | 超时上限 |
| `maxOutputBytes` | `64000` | 输出截断阈值 |
| `maxSpillBytes` | `67108864` | 溢出文件上限 |
| `graceMs` | `3000` | 终止宽限期 |
| `bashPath` | 自动解析 | `bash.exe` 完整路径 |
| `coreutilsPath` | 自动解析 | `coreutils.exe` 可执行文件路径；无标准位置时显式设置 |
| `coreutilsBinPath` | 自动解析 | Coreutils 命令目录，必须包含 `ls.exe`、`cat.exe`、`grep.exe`、`find.exe` |

### 终端后端（`dsh-coreutils-bash/terminal`）

除同样的 `bashPath` / `coreutilsPath` / `coreutilsBinPath` 覆盖外，还支持：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `backendType` | `coreutils-bash` | 注册到 `ctx.terminals` 的后端名 |
| `shellDialect` | `bash` | 仅支持 `bash` |
| `shellPath` / `shellArgs` | 由 runtime 推导 | 覆盖 shell 启动命令与参数 |
| `rows` / `cols` | `40` / `160` | PTY 初始尺寸 |
| `scrollbackLines` / `scrollbackMaxBytes` | `10000` / 4 MiB | 回滚缓冲 |
| `maxReadBytes` | `262144` | 单次读取上限（不得大于回滚字节上限） |
| `pollIntervalMs` / `exactProbeAfterMs` | `50` / `150` | 就绪轮询 |
| `idleSilenceMs` / `handoffGraceMs` | `3000` / `500` | 静默与交接宽限 |
| `promptTailGraceMs` | `0` | 提示符尾随容忍 |
| `timeoutMs` | `30000` | 启动就绪超时 |
| `disposeGraceMs` | `3000` | 关闭宽限 |

## 预设行为

- `standard`、`ptc` 和 `cordis` 使用普通的一次性 Bash 工具。
- `minimal` 使用持久化的 Bash PTY，因此 `cd`、`export`、shell 函数等会话状态在多次调用之间得以保留。

## 故障排查

解析失败时，执行器会抛出包含以下内容的诊断信息：实际检查过的 `bash.exe` 候选路径、检查过的 Coreutils 命令目录、以及安装指引。遇到时：

1. 确认 `bash.exe` 可在 Git Bash/MSYS2 中直接运行。
2. 确认 Coreutils 命令目录中存在 `ls.exe`、`cat.exe`、`grep.exe`、`find.exe`。
3. 在插件行中显式设置 `bashPath`、`coreutilsPath` 或 `coreutilsBinPath`。

仓库自带两个自检脚本（需要 Node.js）：

```bash
node scripts/test-resolve.mjs   # 验证 runtime 解析与真实 bash 执行
node scripts/probe.mjs          # 在受控 PATH 下探测 bash + Coreutils 组合
```

## Windows 注意事项

Bash 命令使用 Bash 语法以及 Git Bash/MSYS2 的路径约定。Microsoft Coreutils 遵循 Windows 的 ACL 与进程语义，因此不要假设 POSIX 信号、`/dev/null`、Unix 权限以及所有 GNU 工具的行为与 Linux 上完全一致。

## 兼容性

`package.json` 将 `@deepseek-ai/dsh-bash-local`、`@deepseek-ai/dsh-bash-sandbox`、`@deepseek-ai/dsh-sandbox`、`@deepseek-ai/dsh-terminal-bash` 四个 peer 限定在 `>=0.2.0-rc.1 <0.3.0-0`，并通过 `engines.dsh` 声明兼容范围。升级到范围外的 DSH 版本时，安装或启动会被 `incompatible-version` 拒绝；范围内仍需确认复制的执行逻辑与上游 API 兼容。

预设补丁整行替换内置预设的 Shell 配置，DSH 预设结构变化时需要同步更新 [cordis.patch.yml](cordis.patch.yml)。

## 开发

- `scripts/parse-patch.mjs` — 校验补丁层包含全部必需条目 id。
- `scripts/test-resolve.mjs` — runtime 解析与真实 bash 执行的自检。
- `scripts/probe.mjs` — 受控 PATH 环境下的 bash + Coreutils 探测。
- `scripts/load-installed.mjs` — 从已安装 profile 加载执行器模块做冒烟检查。

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。
