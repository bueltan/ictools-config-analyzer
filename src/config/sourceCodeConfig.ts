import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

import { Consts } from '../consts';
import { Repo } from '../models';

export function findSourceCodeConfig(rootDir: string): string | undefined {
    const direct = path.join(
        rootDir,
        Consts.SUB_FOLDER_VENV_CONFIGS,
        Consts.SOURCE_CODE
    );
    if (fs.existsSync(direct)) {
        return direct;
    }

    const target = Consts.SOURCE_CODE;
    const stack: string[] = [rootDir];

    while (stack.length) {
        const current = stack.pop() as string;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
            } else if (entry.isFile() && entry.name === target) {
                return fullPath;
            }
        }
    }

    return undefined;
}

export function loadReposFromSourceCodeConfig(configPath: string): Repo[] {
    const text = fs.readFileSync(configPath, 'utf8');
    const raw = yaml.parse(text) as Record<string, any> | null;

    if (!raw || typeof raw !== 'object') {
        return [];
    }

    const repos: Repo[] = [];
    for (const [name, cfg] of Object.entries(raw)) {
        if (!cfg || typeof cfg !== 'object') {
            continue;
        }
        const git_url = (cfg as any).git_url ?? '';
        const git_ref = (cfg as any).git_ref ?? '';
        if (!git_url || !git_ref) {
            continue;
        }
        repos.push({ name, git_url, git_ref });
    }
    return repos;
}
