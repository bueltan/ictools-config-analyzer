export function pep503Normalize(name: string): string {
    return name
        .toLowerCase()
        .replace(/[-_.]+/g, '-')
        .trim();
}

export function versionExistsInHtml(
    html: string,
    project: string,
    wanted: string
): boolean {
    const normalized = pep503Normalize(project);
    const candidates = [
        `${project}-${wanted}`,
        `${project.replace(/-/g, '_')}-${wanted}`,
        `${normalized.replace(/-/g, '_')}-${wanted}`,
        `${normalized}-${wanted}`
    ];

    const htmlLower = html.toLowerCase();
    const candLower = candidates.map(c => c.toLowerCase());

    return candLower.some(c => htmlLower.includes(c));
}
