import { spawnSync } from 'node:child_process';
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
env.PATH = 'C:\\Program Files\\coreutils\\bin;C:\\Program Files\\Git\\usr\\bin;' + (process.env.PATH ?? process.env.Path ?? '');
const script = String.raw`printf 'bash-ok\n'; command -v ls; ls --version; printf 'beta\nalpha\n' | sort; printf '%s\n' '*.txt'; command -v sed; printf '%s\n' "$PATH"; grep --version; find --version`;
const result = spawnSync('C:\\Program Files\\Git\\usr\\bin\\bash.exe', ['--noprofile', '--norc', '-c', script], { env, encoding: 'utf8', timeout: 15000, windowsHide: true });
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status ?? 1;
