import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

import { Consts } from '../consts';
import { PiPConfigInfo, PackageInfo } from '../models';

export function findPipConfigFiles(rootDir: string): string[] {
    const venvRoot = path.join(rootDir, Consts.SUB_FOLDER_VENV_CONFIGS);
    const found: string[] = [];
    if (!fs.existsSync(venvRoot)) {
        return found;
    }

    const dccDirs = fs.readdirSync(venvRoot, { withFileTypes: true });
    for (const dcc of dccDirs) {
        if (!dcc.isDirectory()) {
            continue;
        }
        const dccDir = path.join(venvRoot, dcc.name);
        const versionDirs = fs.readdirSync(dccDir, { withFileTypes: true });
        for (const vdir of versionDirs) {
            if (!vdir.isDirectory()) {
                continue;
            }
            const pipConfigPath = path.join(
                dccDir,
                vdir.name,
                Consts.DCC_VENV_CONFIG_FILE_NAME
            );
            if (fs.existsSync(pipConfigPath)) {
                found.push(pipConfigPath);
            }
        }
    }
    return found;
}

export function buildPiPConfigFromPath(pipPath: string): PiPConfigInfo | null {
    const version = path.basename(path.dirname(pipPath));
    const dccName = path.basename(path.dirname(path.dirname(pipPath)));

    let raw: any;
    try {
        const text = fs.readFileSync(pipPath, 'utf8');
        raw = yaml.parse(text);
    } catch (e: any) {
        return {
            dccName,
            dccVersion: version,
            pipConfigPath: pipPath,
            analyze: false,
            valid: false,
            errorMessages: [String(e)],
            timestamp: Date.now(),
            packages: []
        };
    }

    const pkgsRaw = Array.isArray(raw?.packages) ? raw.packages : [];
    const packages: PackageInfo[] = pkgsRaw.map((p: any): PackageInfo => ({
        name: String(p?.name ?? '').trim(),
        type: String(p?.type ?? '').trim(),
        url: String(p?.url ?? '').trim(),
        version: String(p?.version ?? '').trim(),
        valid: null,
        errorMessage: '',
        timestamp: null,
        status: 'Not validated'
    }));

    return {
        dccName,
        dccVersion: version,
        pipConfigPath: pipPath,
        analyze: true,
        valid: null,
        errorMessages: [],
        timestamp: Date.now(),
        packages
    };
}

export function collectPiPConfigs(rootDir: string): PiPConfigInfo[] {
    const paths = findPipConfigFiles(rootDir);
    const configs: PiPConfigInfo[] = [];
    for (const p of paths) {
        const cfg = buildPiPConfigFromPath(p);
        if (cfg) {
            configs.push(cfg);
        }
    }
    return configs;
}
