# Coreutils Bash for DeepSeek Harness

[简体中文](README.md) | [English](README.en.md)

This bundle adds native Bash backed by Microsoft Coreutils to DeepSeek Harness (DSH) on Windows while retaining official PowerShell capabilities. The standard/ptc/cordis presets expose both one-shot `bash` and `pwsh`; minimal exposes persistent Bash and PowerShell.

## How it works

The bundle hooks into DSH's standard composition through a [cordis.patch.yml](cordis.patch.yml) patch layer:

- It keeps the root `pwsh-sandbox` executor (`@deepseek-ai/dsh-pwsh-sandbox`) for permission-presets. Each executable Agent preset mounts two separate `shell` isolation groups: official `pwsh-sandbox` + `tool-pwsh`, and this package's `coreutils-bash-sandbox` + `tool-bash`. The providers never share a `ctx.shell` scope, including concurrently retained preset generations. Each tool retains its own sandbox and approval semantics.
- It rewrites the shell rows of `standard`, `ptc`, `cordis`, and `minimal`: the first three expose both one-shot tools, while minimal exposes two persistent tools backed by distinct Bash and PowerShell PTY backend types.
- It registers a `coreutils-bash` backend into the persistent terminal group (`optional-persistent-terminals`, from the official terminal bundle); when that bundle is not selected, the insert is skipped with a warning and everything else keeps working.
- Only Bash child processes get the Coreutils and Bash directories prepended to `PATH`, plus `DSH_COREUTILS_BASH=1` and `DSH_COREUTILS_BIN`; native pwsh command resolution is left unchanged.

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

Installation from [npm](https://www.npmjs.com/package/dsh-coreutils-bash) is recommended. Enter `dsh-coreutils-bash` in the plugin installation page, or run:

```bash
dsh plugin add dsh-coreutils-bash
```

Without a version, this installs npm's `latest` release. To pin a version, run:

```bash
dsh plugin add dsh-coreutils-bash@1.1.0
```

Supported install specs:

| Form | Example |
| --- | --- |
| npm (recommended, latest) | `dsh-coreutils-bash` |
| npm (pinned version) | `dsh-coreutils-bash@1.1.0` |
| Local directory (absolute path) | `D:\github\dsh-coreutils-bash` |
| GitHub repository | `github:fqscfqj/dsh-coreutils-bash` |
| Git URL | `git+https://github.com/fqscfqj/dsh-coreutils-bash.git` |

GitHub / Git URL installs follow the repository's default branch and may include changes not yet published to npm.

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

- `standard`, `ptc`, and `cordis` expose both one-shot `bash` and `pwsh`; each call starts a fresh process.
- `minimal` exposes persistent `bash` and `pwsh`: cwd, variables, functions, and imported modules persist independently in each shell. They do not share process-local state.
- The official persistent terminal bundle still supplies the default Windows PowerShell `shell` backend; this bundle only adds `coreutils-bash` beside it.

## Preserving PowerShell capabilities

Use native PowerShell syntax directly in the `pwsh` tool, without a Bash parsing layer. Object creation, filtering, and property access remain in one PowerShell pipeline:

```powershell
1, 2, 3 | ForEach-Object { [pscustomobject]@{ Value = $_; Double = $_ * 2 } } |
  Where-Object Double -gt 2 | Select-Object Value, Double | ConvertTo-Json -Compress
```

Cmdlets, modules, Windows paths, `$env:NAME`, the registry provider, and object pipelines within PowerShell remain native PowerShell features. This bundle does not translate them to Bash or reimplement the PowerShell executor.

The native DSH boundaries still apply:

- One-shot `pwsh` uses `-NoProfile`; explicitly `Import-Module` when needed. Use minimal's persistent `pwsh` or the official PowerShell terminal for cross-call state.
- Read-only ConstrainedLanguage restricts non-core .NET types, `Add-Type`, COM, and reflection. Workspace-write and host policy may also restrict operations. Keeping pwsh does not bypass sandbox policy or grant administrator privileges.
- Bash/PowerShell process boundaries carry bytes/text rather than live objects; explicitly use `ConvertTo-Json` and `ConvertFrom-Json` for structured interchange.
- Older or Bash-only sessions can still explicitly launch a child: `pwsh.exe -NoLogo -NoProfile -NonInteractive -Command '$items = 1, 2, 3; $items | ForEach-Object { $_ * 2 }'`. Outer single quotes prevent Bash from expanding `$`; use `-File` with Windows paths or UTF-16LE Base64 `-EncodedCommand` for complex scripts. A child does not retain pwsh state and remains subject to its parent's sandbox. Do not switch shells to retry a denied operation.

Use Bash for regular commands and Coreutils, and `pwsh` for native Windows operations or PowerShell object processing. No provider dialect switching or disabling this bundle is needed.

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

`package.json` allows the `@deepseek-ai/dsh-bash-local`, `@deepseek-ai/dsh-bash-sandbox`, `@deepseek-ai/dsh-pwsh-sandbox`, `@deepseek-ai/dsh-tool-pwsh`, `@deepseek-ai/dsh-tool-pwsh-persistent`, `@deepseek-ai/dsh-sandbox`, and `@deepseek-ai/dsh-terminal-bash` peers in the range `>=0.2.0-rc.1 <0.3.0-0` and declares the same DSH compatibility through `engines.dsh`. Upgrades outside that range are rejected by dependency validation; versions inside it still require the copied executor logic to remain compatible with the upstream API.


The preset patches replace the built-in presets' shell configuration wholesale; when DSH's preset structure changes, [cordis.patch.yml](cordis.patch.yml) must be updated to match.

## Development

- `scripts/parse-patch.mjs` — verifies the patch layer contains every required entry id.
- `scripts/test-resolve.mjs` — self-check for runtime resolution and a real bash run.
- `scripts/probe.mjs` — bash + Coreutils probe under a controlled PATH.
- `scripts/load-installed.mjs` — smoke-loads the executor module from an installed profile.

## License

Released under the [MIT License](LICENSE).
