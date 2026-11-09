# Coreutils Bash for DeepSeek Harness

[简体中文](README.md) | [English](README.en.md)

This bundle replaces the DeepSeek Harness (DSH) Windows PowerShell shell surface with native Bash backed by Microsoft Coreutils, across the one-shot executor, the four built-in agent presets, and the persistent terminal.

## How it works

The bundle hooks into DSH's standard composition through a [cordis.patch.yml](cordis.patch.yml) patch layer:

- It disables the root `pwsh-sandbox` executor (`@deepseek-ai/dsh-pwsh-sandbox`) and inserts this package's `coreutils-bash-sandbox` executor (`dsh-coreutils-bash/executor`). The executor extends `@deepseek-ai/dsh-bash-sandbox`, inheriting all of its sandbox semantics, and only swaps the argv to `bash.exe --noprofile --norc -c <command>`.
- It rewrites the shell rows of the `standard`, `ptc`, `cordis`, and `minimal` presets: `tool-pwsh` off, `tool-bash` on; the `minimal` persistent shell group switches to this package's `coreutils-bash` PTY backend.
- It registers a `coreutils-bash` backend into the persistent terminal group (`optional-persistent-terminals`, from the official terminal bundle); when that bundle is not selected, the insert is skipped with a warning and everything else keeps working.
- Every child process gets the Coreutils command directory and the bash directory prepended to `PATH`, plus the `DSH_COREUTILS_BASH=1` and `DSH_COREUTILS_BIN` environment variables.

Existing Harness sandbox modes, approvals, timeout budgets, output limits, cancellation, and process cleanup remain active.

## Prerequisites

- Windows (this bundle is only meaningful on Windows).
- Git for Windows or MSYS2, providing `bash.exe`.
- Microsoft Coreutils, installed for example with `winget install Microsoft.Coreutils`.
- `pnpm` on `PATH` when installing through the CLI standard flow.

Microsoft Coreutils supplies native Windows utilities such as `ls`, `cat`, `grep`, and `find` (uutils-based); it is not a Bash interpreter. The bundle therefore requires both components and never silently falls back to PowerShell.

## Installation

This bundle is a standard DSH third-party bundle (`package.json` declares `dsh.bundle.patch`) and installs through DSH's standard installation flow:

All of the following use the same standard installation flow and are equivalent:

- **Desktop app / Web UI**: the sidebar **Plugins** page → install, entering an install spec — one click.
- **Agent tool**: ask the agent to call `plugin_manager` `install_bundle`.
- **CLI**: `dsh plugin add <spec>` (or `dsh plugin --profile <name> add <spec>`).

The GitHub repository spec is recommended; it installs the latest published version directly.

Supported install specs:

| Form | Example |
| --- | --- |
| Local directory (absolute path) | `D:\github\dsh-coreutils-bash` |
| GitHub repository | `github:fqscfqj/dsh-coreutils-bash` |
| Git URL | `git+https://github.com/fqscfqj/dsh-coreutils-bash.git` |

Installation enables the bundle by default. Installation and selection affect every session in the profile; `plugin_manager` tool operations require `danger-full-access` or per-call approval. If the dependency already exists (for example previously wired in by hand as `link:`), the standard install reports `already-installed`; remove it first and install again to run the full flow.

Additional notes:

- Installing from a local directory wires the package in with pnpm `link:`; the peer-dependencies WARN in the install log is expected — those peers are provided by the DSH runtime itself. GitHub / Git URL installs are copy installs and do not emit the warning.
- Installation is profile-level configuration; a running DSH instance must be restarted (or a new session started) before the newly installed bundle is loaded.

### Verify the installation

In any session's Bash tool run:

```bash
echo "$DSH_COREUTILS_BASH"; command -v ls; ls --version
```

Expect `DSH_COREUTILS_BASH=1`, an `ls` resolved inside the Coreutils directory, and an `ls (uutils coreutils) …` version line.

## Configuration

The default resolver checks common Git for Windows, MSYS2, and Microsoft Coreutils locations (`C:\Program Files\Git`, `C:\msys64`, `C:\Program Files\coreutils`, `%LOCALAPPDATA%\Programs\coreutils`, scoop, and `PATH`). When an installation uses a nonstandard location, override the following fields on the plugin row:

### Executor (`dsh-coreutils-bash/executor`)

| Field | Default | Description |
| --- | --- | --- |
| `cwd` | `process.cwd()` | Command working directory |
| `timeoutMs` | `120000` | Per-command timeout |
| `maxTimeoutMs` | `600000` | Timeout ceiling |
| `maxOutputBytes` | `64000` | Output truncation threshold |
| `maxSpillBytes` | `67108864` | Spill file cap |
| `graceMs` | `3000` | Termination grace period |
| `bashPath` | auto-resolved | Full path to `bash.exe` |
| `coreutilsPath` | auto-resolved | Path to the `coreutils.exe` executable; set explicitly for nonstandard locations |
| `coreutilsBinPath` | auto-resolved | Coreutils command directory; must contain `ls.exe`, `cat.exe`, `grep.exe`, `find.exe` |

### Terminal backend (`dsh-coreutils-bash/terminal`)

Besides the same `bashPath` / `coreutilsPath` / `coreutilsBinPath` overrides:

| Field | Default | Description |
| --- | --- | --- |
| `backendType` | `coreutils-bash` | Backend name registered with `ctx.terminals` |
| `shellDialect` | `bash` | Only `bash` is supported |
| `shellPath` / `shellArgs` | derived from the runtime | Override the shell command and arguments |
| `rows` / `cols` | `40` / `160` | Initial PTY size |
| `scrollbackLines` / `scrollbackMaxBytes` | `10000` / 4 MiB | Scrollback buffer |
| `maxReadBytes` | `262144` | Per-read cap (must not exceed the scrollback byte cap) |
| `pollIntervalMs` / `exactProbeAfterMs` | `50` / `150` | Readiness polling |
| `idleSilenceMs` / `handoffGraceMs` | `3000` / `500` | Silence and handoff grace |
| `promptTailGraceMs` | `0` | Prompt-tail tolerance |
| `timeoutMs` | `30000` | Startup readiness timeout |
| `disposeGraceMs` | `3000` | Disposal grace period |

## Behavior

- `standard`, `ptc`, and `cordis` use the normal one-shot Bash tool.
- `minimal` uses a persistent Bash PTY, so `cd`, `export`, shell functions, and other session state survive between calls.

## Troubleshooting

When resolution fails, the executor throws a diagnostic listing the `bash.exe` candidate paths it checked, the Coreutils command directories it checked, and installation guidance. When you see it:

1. Confirm `bash.exe` runs directly from Git Bash/MSYS2.
2. Confirm the Coreutils command directory contains `ls.exe`, `cat.exe`, `grep.exe`, `find.exe`.
3. Set `bashPath`, `coreutilsPath`, or `coreutilsBinPath` explicitly on the plugin row.

The repository ships two self-check scripts (Node.js required):

```bash
node scripts/test-resolve.mjs   # verify runtime resolution and a real bash run
node scripts/probe.mjs          # probe the bash + Coreutils pairing under a controlled PATH
```

## Windows notes

Bash commands use Bash syntax and Git Bash/MSYS2 path conventions. Microsoft Coreutils follows Windows ACL and process semantics, so POSIX signals, `/dev/null`, Unix permissions, and every GNU utility should not be assumed to behave exactly as on Linux.

## Compatibility

`package.json` allows the `@deepseek-ai/dsh-bash-local`, `@deepseek-ai/dsh-bash-sandbox`, `@deepseek-ai/dsh-sandbox`, and `@deepseek-ai/dsh-terminal-bash` peers in the range `>=0.2.0-rc.1 <0.3.0-0` and declares the same DSH compatibility through `engines.dsh`. Upgrades outside that range are rejected by dependency validation; versions inside it still require the copied executor logic to remain compatible with the upstream API.


The preset patches replace the built-in presets' shell configuration wholesale; when DSH's preset structure changes, [cordis.patch.yml](cordis.patch.yml) must be updated to match.

## Development

- `scripts/parse-patch.mjs` — verifies the patch layer contains every required entry id.
- `scripts/test-resolve.mjs` — self-check for runtime resolution and a real bash run.
- `scripts/probe.mjs` — bash + Coreutils probe under a controlled PATH.
- `scripts/load-installed.mjs` — smoke-loads the executor module from an installed profile.

## License

Released under the [MIT License](LICENSE).
