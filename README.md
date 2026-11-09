# Coreutils Bash for DeepSeek Harness

[简体中文](README.md) | [English](README.en.md)

这个 Bundle 将 DeepSeek Harness 在 Windows 上的 PowerShell Shell 替换为由 Microsoft Coreutils 支持的原生 Bash。

## 前置要求

- Git for Windows 或 MSYS2，提供 `bash.exe`。
- Microsoft Coreutils，可通过 `winget install Microsoft.Coreutils` 安装。

Microsoft Coreutils 提供的是 `ls`、`cat`、`grep`、`find` 等原生 Windows 工具，它并不是 Bash 解释器。因此本 Bundle 需要同时安装上述两个组件，并且绝不会静默回退到 PowerShell。

## 行为说明

- `standard`、`ptc` 和 `cordis` 使用普通的一次性 Bash 工具。
- `minimal` 使用持久化的 Bash PTY，因此 `cd`、`export`、shell 函数等会话状态在多次调用之间得以保留。
- Coreutils 命令目录会被放在每个子进程 `PATH` 的最前面。
- Harness 现有的沙箱模式、审批流程、超时预算、输出限制、取消机制和进程清理均保持生效。

默认解析器会检查常见的 Git for Windows、MSYS2 和 Microsoft Coreutils 安装位置。如果安装位置非标准，可以在配置行中覆盖 `bashPath`、`coreutilsPath` 或 `coreutilsBinPath`。`coreutilsBinPath` 必须包含生成的工具可执行文件，包括 `ls.exe`、`cat.exe`、`grep.exe` 和 `find.exe`。

## Windows 注意事项

Bash 命令使用 Bash 语法以及 Git Bash/MSYS2 的路径约定。Microsoft Coreutils 遵循 Windows 的 ACL 与进程语义，因此不要假设 POSIX 信号、`/dev/null`、Unix 权限以及所有 GNU 工具的行为与 Linux 上完全一致。

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。
