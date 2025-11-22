import { Repo, RepoStatusMessage } from '../models';
import { Consts } from '../consts';
import { checkRefFast } from './gitValidator';

export async function validateReposInExtension(
    repos: Repo[],
    post: (msg: any) => void
): Promise<void> {
    let anyMissing = false;
    let anyAccessError = false;

    const concurrency = Math.min(Consts.PARALLEL_JOBS, repos.length);
    let index = 0;

    async function processRepo(repo: Repo) {
        let status = '';
        let ok = false;

        try {
            const res = await checkRefFast(
                repo.git_url,
                repo.git_ref,
                Consts.TIMEOUT_GIT_REF_CHECK,
                Consts.SCAN_REPO
            );
            ok = !!res.ok;
            status = res.status ?? '';
        } catch (e: any) {
            status = `access error: ${e?.message ?? String(e)}`;
        }

        let severity: RepoStatusMessage['severity'] = 'info';

        if (status.startsWith('access error')) {
            severity = 'access_error';
            anyAccessError = true;
        } else if (!ok && status.startsWith('missing')) {
            severity = 'missing';
            anyMissing = true;
        }

        const payload: RepoStatusMessage = {
            name: repo.name,
            git_url: repo.git_url,
            git_ref: repo.git_ref,
            status,
            severity
        };

        post({
            type: 'repoStatus',
            payload: {
                ...payload,
                timestamp: Date.now()
            }
        });
    }

    async function worker() {
        while (true) {
            const i = index;
            if (i >= repos.length) {
                break;
            }
            index = i + 1;
            const repo = repos[i];
            try {
                await processRepo(repo);
            } catch (e: any) {
                post({
                    type: 'repoStatus',
                    payload: {
                        name: repo.name,
                        git_url: repo.git_url,
                        git_ref: repo.git_ref,
                        status: `access error: ${e?.message ?? String(e)}`,
                        severity: 'access_error',
                        timestamp: Date.now()
                    }
                });
            }
        }
    }

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    post({ type: 'summary', payload: { anyMissing, anyAccessError } });
}
