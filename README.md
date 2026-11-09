# Coreutils Bash for DeepSeek Harness

This bundle replaces the Windows PowerShell shell surface with native Bash backed by Microsoft Coreutils.

## Prerequisites

- Git for Windows or MSYS2, providing `bash.exe`.
- Microsoft Coreutils, installed for example with `winget install Microsoft.Coreutils`.

Microsoft Coreutils supplies native Windows utilities such as `ls`, `cat`, `grep`, and `find`; it is not a Bash interpreter. The bundle therefore requires both components and never silently falls back to PowerShell.

## Behavior

- `standard`, `ptc`, and `cordis` use the normal one-shot Bash tool.
- `minimal` uses a persistent Bash PTY, so `cd`, `export`, shell functions, and other session state survive between calls.
- The Coreutils command directory is placed first in each child `PATH`.
- Existing Harness sandbox modes, approvals, timeout budgets, output limits, cancellation, and process cleanup remain active.

The default resolver checks common Git for Windows, MSYS2, and Microsoft Coreutils locations. A row can override `bashPath`, `coreutilsPath`, or `coreutilsBinPath` when an installation uses a nonstandard location. `coreutilsBinPath` must contain the generated utility executables, including `ls.exe`, `cat.exe`, `grep.exe`, and `find.exe`.

## Windows notes

Bash commands use Bash syntax and Git Bash/MSYS2 path conventions. Microsoft Coreutils follows Windows ACL and process semantics, so POSIX signals, `/dev/null`, Unix permissions, and every GNU utility should not be assumed to behave exactly as on Linux.
