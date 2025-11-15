// gitValidator.ts
import { CmdRunner } from './cmdRunner';

export interface RepoRefStatus {
    ok: boolean;
    status: string;
    rawError?: string | null;
}

export function normalizeShortRef(gitRef: string): string {
    if (gitRef.startsWith('refs/heads/')) {
        return gitRef.slice('refs/heads/'.length);
    }
    if (gitRef.startsWith('refs/tags/')) {
        return gitRef.slice('refs/tags/'.length);
    }
    return gitRef;
}

export async function checkRefFast(
    gitUrl: string,
    gitRef: string,
    timeoutSeconds: number | undefined,
    allowScan: boolean
): Promise<RepoRefStatus> {
    const runner = new CmdRunner();
    const short = normalizeShortRef(gitRef);
    const refspecs = [`refs/heads/${short}`, `refs/tags/${short}`, short];

    const timeoutMs = timeoutSeconds ? timeoutSeconds * 1000 : undefined;

    const { rc, stdout, stderr } = await runner.runCmdWithRetries(
        ['git', 'ls-remote', gitUrl, ...refspecs],
        { timeoutMs }
    );

    if (rc !== 0) {
        const msg = stderr.trim() || 'unknown error';
        return {
            ok: false,
            status: `access error: ${msg}`,
            rawError: stderr
        };
    }

    const out = stdout.trim();
    if (out) {
        const lines = out.split(/\r?\n/);
        if (lines.some(l => l.endsWith(`refs/heads/${short}`))) {
            return { ok: true, status: 'OK (branch found)', rawError: null };
        }
        if (
            lines.some(
                l =>
                    l.endsWith(`refs/tags/${short}`) ||
                    l.includes(`refs/tags/${short}^{}`)
            )
        ) {
            return { ok: true, status: 'OK (tag found)', rawError: null };
        }
        return { ok: true, status: 'OK (ref matched)', rawError: null };
    }

    if (!allowScan) {
        return {
            ok: false,
            status: 'missing (not found as branch/tag/ref)',
            rawError: null
        };
    }

    const fullScan = await runner.runCmdWithRetries(
        ['git', 'ls-remote', gitUrl],
        { timeoutMs }
    );

    if (fullScan.rc !== 0) {
        const msg = fullScan.stderr.trim() || 'unknown error';
        return {
            ok: false,
            status: `access error: ${msg}`,
            rawError: fullScan.stderr
        };
    }

    if (
        fullScan.stdout.includes(`refs/heads/${short}`) ||
        fullScan.stdout.includes(`refs/tags/${short}`) ||
        fullScan.stdout.includes(short)
    ) {
        return { ok: true, status: 'OK (ref found by scan)', rawError: null };
    }

    return { ok: false, status: 'missing (ref not found)', rawError: null };
}
