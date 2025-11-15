import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

import { checkRefFast } from './gitValidator';
import { Consts } from './consts';
import { PiPConfigInfo, PackageInfo } from './models';

interface Repo {
    name: string;
    git_url: string;
    git_ref: string;
}

interface RepoStatusMessage {
    name: string;
    git_url: string;
    git_ref: string;
    status: string;
    severity: 'access_error' | 'missing' | 'info';
}

let outputChannel: vscode.OutputChannel | undefined;

function logDebug(message: string) {
    if (!outputChannel) {
        return;
    }
    outputChannel.appendLine(message);
}

// ---------- PEP503 helpers (packages) ----------

function pep503Normalize(name: string): string {
    return name
        .toLowerCase()
        .replace(/[-_.]+/g, '-')
        .trim();
}

function versionExistsInHtml(html: string, project: string, wanted: string): boolean {
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

function getIndexAuth(): { user?: string; pass?: string } {
    const user = process.env.PIP_INDEX_USER;
    const pass = process.env.PIP_INDEX_PASS;
    return { user: user || undefined, pass: pass || undefined };
}

async function checkPackageVersion(pkg: PackageInfo): Promise<PackageInfo> {
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

// ---------- Webview HTML ----------

function getNonce() {
    const possible =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function getWebviewContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): string {
    const htmlUri = vscode.Uri.joinPath(
        extensionUri,
        'media',
        'configAnalyzer.html'
    );
    const htmlPath = htmlUri.fsPath;

    let html = fs.readFileSync(htmlPath, 'utf8');
    const nonce = getNonce();

    const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'media', 'configAnalyzer.js')
    );
    const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'media', 'configAnalyzer.css')
    );

    html = html
        .replace(/\${cspSource}/g, webview.cspSource)
        .replace(/\${nonce}/g, nonce)
        .replace(/\${scriptUri}/g, scriptUri.toString())
        .replace(/\${styleUri}/g, styleUri.toString());

    return html;
}

// ---------- Config discovery ----------

function findSourceCodeConfig(rootDir: string): string | undefined {
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

function loadReposFromSourceCodeConfig(configPath: string): Repo[] {
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

function findPipConfigFiles(rootDir: string): string[] {
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

function buildPiPConfigFromPath(pipPath: string): PiPConfigInfo | null {
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

function collectPiPConfigs(rootDir: string): PiPConfigInfo[] {
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

// ---------- Validation logic ----------

async function validateReposInExtension(
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

async function validatePipConfigPackages(
    cfg: PiPConfigInfo,
    post: (msg: any) => void
): Promise<{ anyIssues: boolean }> {
    const packages = cfg.packages || [];
    let anyIssues = false;

    for (const pkg of packages) {
        const updated = await checkPackageVersion(pkg);
        if (!updated.valid) {
            anyIssues = true;
        }
        post({
            type: 'pipPackageStatus',
            payload: {
                pipConfigPath: cfg.pipConfigPath,
                pkgName: updated.name,
                status: updated.status,
                valid: updated.valid
            }
        });
    }

    return { anyIssues };
}

// ---------- Extension entry ----------

export function activate(context: vscode.ExtensionContext) {
    let panel: vscode.WebviewPanel | undefined;
    let selectedFolder: vscode.Uri | undefined;
    let lastRepos: Repo[] = [];
    let lastPipConfigs: PiPConfigInfo[] = [];

    outputChannel = vscode.window.createOutputChannel(
        'ICTools Config Analyzer'
    );

    const disposable = vscode.commands.registerCommand(
        'ictools-config-analyzer.openWebUI',
        () => {
            if (panel) {
                panel.reveal(vscode.ViewColumn.One);
                return;
            }

            panel = vscode.window.createWebviewPanel(
                'ictoolsConfigAnalyzer',
                'ICTools Config Analyzer',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(context.extensionUri, 'media')
                    ]
                }
            );

            panel.webview.html = getWebviewContent(
                panel.webview,
                context.extensionUri
            );

            panel.onDidDispose(
                () => {
                    panel = undefined;
                    selectedFolder = undefined;
                    lastRepos = [];
                    lastPipConfigs = [];
                },
                null,
                context.subscriptions
            );

            panel.webview.onDidReceiveMessage(
                async message => {
                    if (!panel) {
                        return;
                    }

                    switch (message.type) {
                        case 'pickFolder': {
                            const folder =
                                await vscode.window.showOpenDialog({
                                    canSelectFiles: false,
                                    canSelectFolders: true,
                                    canSelectMany: false,
                                    openLabel:
                                        'Select PIM configuration folder'
                                });

                            if (!folder || folder.length === 0) {
                                selectedFolder = undefined;
                                lastRepos = [];
                                lastPipConfigs = [];
                                panel.webview.postMessage({
                                    type: 'folderSelected',
                                    path: ''
                                });
                                break;
                            }

                            selectedFolder = folder[0];

                            panel.webview.postMessage({
                                type: 'folderSelected',
                                path: selectedFolder.fsPath
                            });

                            const rootPath = selectedFolder.fsPath;

                            const srcConfigPath =
                                findSourceCodeConfig(rootPath);
                            if (srcConfigPath) {
                                const repos =
                                    loadReposFromSourceCodeConfig(
                                        srcConfigPath
                                    );
                                lastRepos = repos;
                                panel.webview.postMessage({
                                    type: 'sourceCodeRepos',
                                    payload: repos
                                });
                                panel.webview.postMessage({
                                    type: 'status',
                                    text: `Loaded ${
                                        repos.length
                                    } repositories from ${srcConfigPath}`
                                });
                            } else {
                                lastRepos = [];
                                panel.webview.postMessage({
                                    type: 'sourceCodeRepos',
                                    payload: []
                                });
                                panel.webview.postMessage({
                                    type: 'status',
                                    text: 'ic-source-code.yml not found under selected folder.'
                                });
                            }

                            const pipConfigs =
                                collectPiPConfigs(rootPath) || [];
                            lastPipConfigs = pipConfigs;
                            panel.webview.postMessage({
                                type: 'pipConfigs',
                                payload: pipConfigs
                            });

                            break;
                        }

                        case 'runAllSourceRepos': {
                            if (!lastRepos.length) {
                                vscode.window.showWarningMessage(
                                    'No repositories loaded.'
                                );
                                break;
                            }

                            panel.webview.postMessage({
                                type: 'status',
                                text: `Validating ${lastRepos.length} repositories...`
                            });

                            await validateReposInExtension(
                                lastRepos,
                                msg => panel?.webview.postMessage(msg)
                            );

                            panel.webview.postMessage({
                                type: 'status',
                                text: 'Validation finished for all repositories.'
                            });
                            break;
                        }

                        case 'runPipConfig': {
                            const pipConfigPath =
                                message.payload?.pipConfigPath;
                            if (!pipConfigPath || !lastPipConfigs.length) {
                                break;
                            }
                            const cfg = lastPipConfigs.find(
                                c => c.pipConfigPath === pipConfigPath
                            );
                            if (!cfg) {
                                break;
                            }

                            panel.webview.postMessage({
                                type: 'status',
                                text: `Validating packages for "${cfg.dccName}"...`
                            });

                            const { anyIssues } =
                                await validatePipConfigPackages(
                                    cfg,
                                    msg => panel?.webview.postMessage(msg)
                                );

                            const ts = Date.now();
                            panel.webview.postMessage({
                                type: 'pipConfigSummary',
                                payload: {
                                    pipConfigPath: cfg.pipConfigPath,
                                    anyIssues,
                                    timestamp: ts
                                }
                            });

                            panel.webview.postMessage({
                                type: 'status',
                                text: `Package validation finished for "${cfg.dccName}".`
                            });
                            break;
                        }

                        case 'runAllPipConfigs': {
                            if (!lastPipConfigs.length) {
                                vscode.window.showWarningMessage(
                                    'No PIP configurations loaded.'
                                );
                                break;
                            }

                            panel.webview.postMessage({
                                type: 'status',
                                text: `Validating ${lastPipConfigs.length} PIP configurations...`
                            });

                            for (const cfg of lastPipConfigs) {
                                const { anyIssues } =
                                    await validatePipConfigPackages(
                                        cfg,
                                        msg => panel?.webview.postMessage(msg)
                                    );

                                const ts = Date.now();
                                panel.webview.postMessage({
                                    type: 'pipConfigSummary',
                                    payload: {
                                        pipConfigPath: cfg.pipConfigPath,
                                        anyIssues,
                                        timestamp: ts
                                    }
                                });
                            }

                            panel.webview.postMessage({
                                type: 'status',
                                text: 'Package validation finished for all PIP configurations.'
                            });
                            break;
                        }
					case 'runSingleRepo': {
						const name = message.payload?.name as string | undefined;
						if (!name || !lastRepos.length) {
							break;
						}

						const repo = lastRepos.find(r => r.name === name);
						if (!repo) {
							break;
						}

						panel.webview.postMessage({
							type: 'status',
							text: `Validating repository "${repo.name}"...`
						});

						await validateReposInExtension(
							[repo], // 👈 solo este repo
							msg => panel?.webview.postMessage(msg)
						);

						panel.webview.postMessage({
							type: 'status',
							text: `Validation finished for "${repo.name}".`
						});

						break;
					}


                    }
                },
                undefined,
                context.subscriptions
            );
        }
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {}




