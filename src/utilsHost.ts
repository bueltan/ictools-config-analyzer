    export function hostFromUrl(url: string): string {
    if (url.includes('://')) {
        try {
            const u = new URL(url);
            return u.hostname || 'unknown';
        } catch {
            return 'unknown';
        }
    }
    if (url.includes(':') && url.includes('@')) {
        // git@git.ictools.io:owner/repo.git
        return url.split('@', 1)[1].split(':', 1)[0];
    }
    return 'unknown';
}
