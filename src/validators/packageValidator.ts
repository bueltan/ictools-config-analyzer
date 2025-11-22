import { PackageInfo } from '../models';
import { logDebug } from '../utils/logging';
import { pep503Normalize, versionExistsInHtml } from '../utils/pep503';
import { getIndexAuth } from '../utils/auth';

export async function checkPackageVersion(pkg: PackageInfo): Promise<PackageInfo> {
    const updated: PackageInfo = { ...pkg, timestamp: Date.now() };

    if (!pkg.name || !pkg.url || !pkg.version) {
        updated.valid = false;
        updated.status = 'invalid (missing name/url/version)';
        updated.errorMessage = updated.status || '';
        logDebug(`[PKG] INVALID (missing fields): ${pkg.name} ${pkg.url} ${pkg.version}`);
        return updated;
    }

    let base = pkg.url;
    if (!base.endsWith('/')) {
        base = base + '/';
    }

    const project = pkg.name;
    const projectSlug = pep503Normalize(project);

    const fetchFn: any = (globalThis as any).fetch;
    if (!fetchFn) {
        updated.valid = false;
        updated.status = 'access error: fetch not available in this runtime';
        updated.errorMessage = updated.status || '';
        logDebug(`[PKG] ERROR: fetch not available for ${project}`);
        return updated;
    }

    const url = base + encodeURIComponent(projectSlug) + '/';

    const { user, pass } = getIndexAuth();
    const headers: Record<string, string> = {
        'User-Agent': 'ictools-config-analyzer/1.0',
        'Accept': '*/*'
    };

    if (user && pass) {
        const token = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
        headers['Authorization'] = `Basic ${token}`;
        logDebug(`[PKG] Using Basic Auth for ${project}`);
    } else {
        logDebug(`[PKG] No Basic Auth env vars set for ${project}`);
    }

    logDebug(`\n[PKG] =============================`);
    logDebug(`[PKG] Checking ${project}==${pkg.version}`);
    logDebug(`[PKG] URL: ${url}`);

    try {
        const resp = await fetchFn(url, { headers });
        const html = await resp.text();

        logDebug(`[PKG] HTTP status: ${resp.status}`);
        logDebug(`[PKG] HTML length: ${html.length}`);

        if (!resp.ok) {
            if (resp.status === 404) {
                updated.valid = false;
                updated.status = 'missing (project not in index)';
            } else if (resp.status === 401 || resp.status === 403) {
                updated.valid = false;
                updated.status = `access error: HTTP ${resp.status}`;
            } else {
                updated.valid = false;
                updated.status = `access error: HTTP ${resp.status}`;
            }
            updated.errorMessage = updated.status || '';
            logDebug(`[PKG] ERROR status: ${updated.status}`);
            logDebug(
                `[PKG] HTML snippet: ${html.slice(0, 200).replace(/\s+/g, ' ')}`
            );
            return updated;
        }

        const wanted = pkg.version;
        const exists = versionExistsInHtml(html, project, wanted);
        logDebug(`[PKG] versionExistsInHtml=${exists}`);

        if (!exists) {
            const htmlLower = html.toLowerCase();
            const projectLower = project.toLowerCase().replace(/_/g, '-');
            const idx = htmlLower.indexOf(projectLower);
            if (idx >= 0) {
                const snippet = htmlLower.slice(
                    Math.max(0, idx - 40),
                    idx + 120
                );
                logDebug(
                    `[PKG] HTML around project name: ${snippet
                        .replace(/\s+/g, ' ')
                        .trim()}`
                );
            } else {
                logDebug('[PKG] project name not found literally in HTML.');
            }

            updated.valid = false;
            updated.status = 'missing (version not found)';
            updated.errorMessage = updated.status || '';
            return updated;
        }

        updated.valid = true;
        updated.status = 'OK (version found)';
        updated.errorMessage = '';
        logDebug('[PKG] OK (version found)');
        return updated;
    } catch (e: any) {
        updated.valid = false;
        updated.status = `access error: ${e?.message ?? String(e)}`;
        updated.errorMessage = updated.status || '';
        logDebug(`[PKG] EXCEPTION: ${updated.status}`);
        return updated;
    }
}
