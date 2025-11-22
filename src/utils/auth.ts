export function getIndexAuth(): { user?: string; pass?: string } {
    const user = process.env.PIP_INDEX_USER;
    const pass = process.env.PIP_INDEX_PASS;
    return { user: user || undefined, pass: pass || undefined };
}
