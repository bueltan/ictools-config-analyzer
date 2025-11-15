// cmdRunner.ts
import * as cp from 'child_process';

export interface CmdResult {
    rc: number;
    stdout: string;
    stderr: string;
}

export interface CmdRunOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    retries?: number;
}

export class CmdRunner {
    private static TRANSIENT_PATTERNS = [
        'http 429',
        'rate limit',
        'timed out',
        'operation timed out',
        'the requested url returned error: 5',
        'early eof',
        'connection reset',
        'could not resolve host',
        'connection closed by', // SSH gateway drops
    ];

    private static NON_TRANSIENT_PATTERNS = [
        'permission denied',
        'access denied',
        'authentication failed',
        'fatal: authentication failed',
        'remote: http basic: access denied',
        'remote: permission to',
        'repository not found',
        // IMPORTANT: we do NOT put
        // "fatal: could not read from remote repository" here,
        // because it also happens in transient network issues.
    ];

    private isTransient(rc: number, stdout: string, stderr: string): boolean {
        if (rc === 0) {
            return false;
        }

        const text = (stdout + '\n' + stderr).toLowerCase();

        if (CmdRunner.NON_TRANSIENT_PATTERNS.some(p => text.includes(p))) {
            return false;
        }

        return CmdRunner.TRANSIENT_PATTERNS.some(p => text.includes(p));
    }

    async runCmdWithRetries(
        cmd: string[],
        options: CmdRunOptions = {}
    ): Promise<CmdResult> {
        const retries = options.retries ?? 3;
        let rc = 1;
        let stdout = '';
        let stderr = '';

        for (let attempt = 0; attempt <= retries; attempt++) {
            const result = await this.runOnce(cmd, options);
            rc = result.rc;
            stdout = result.stdout;
            stderr = result.stderr;

            if (!this.isTransient(rc, stdout, stderr)) {
                break;
            }

            if (attempt === retries) {
                break;
            }

            const delayMs = 600 * Math.pow(2, attempt) + Math.random() * 300;
            await new Promise(res => setTimeout(res, delayMs));
        }

        return { rc, stdout, stderr };
    }

    private runOnce(
        cmd: string[],
        opts: CmdRunOptions
    ): Promise<CmdResult> {
        return new Promise(resolve => {
            const [exe, ...args] = cmd;

            const mergedEnv: NodeJS.ProcessEnv = {
                ...process.env,
                GIT_TERMINAL_PROMPT: '0',
                GIT_HTTP_LOW_SPEED_LIMIT: '1000',
                GIT_HTTP_LOW_SPEED_TIME: '10',
                ...(opts.env ?? {}),
            };

            const proc = cp.spawn(exe, args, {
                cwd: opts.cwd,
                env: mergedEnv,
                shell: process.platform === 'win32',
            });

            let stdout = '';
            let stderr = '';

            if (proc.stdout) {
                proc.stdout.on('data', chunk => {
                    stdout += chunk.toString();
                });
            }
            if (proc.stderr) {
                proc.stderr.on('data', chunk => {
                    stderr += chunk.toString();
                });
            }

            let timeoutHandle: NodeJS.Timeout | undefined;
            if (opts.timeoutMs && opts.timeoutMs > 0) {
                timeoutHandle = setTimeout(() => {
                    stderr += '\ncommand timed out';
                    proc.kill('SIGKILL');
                }, opts.timeoutMs);
            }

            proc.on('close', rc => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
                resolve({ rc: rc ?? 1, stdout, stderr });
            });
        });
    }
}
