import * as vscode from 'vscode';

import { Repo, PiPConfigInfo } from '../models';
import { getWebviewContent } from './htmlLoader';
import { findSourceCodeConfig, loadReposFromSourceCodeConfig } from '../config/sourceCodeConfig';
import { collectPiPConfigs } from '../config/pipConfig';
import { validateReposInExtension } from '../validators/repoValidator';
import { validatePipConfigPackages } from '../validators/pipValidator';

export class WebviewManager {
    private panel: vscode.WebviewPanel | undefined;
    private selectedFolder: vscode.Uri | undefined;
    private lastRepos: Repo[] = [];
    private lastPipConfigs: PiPConfigInfo[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {}

    open(): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'ictoolsConfigAnalyzer',
            'ICTools Config Analyzer',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'media')
                ]
            }
        );

        this.panel.webview.html = getWebviewContent(
            this.panel.webview,
            this.context.extensionUri
        );

        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
                this.selectedFolder = undefined;
                this.lastRepos = [];
                this.lastPipConfigs = [];
            },
            null,
            this.context.subscriptions
        );

        this.panel.webview.onDidReceiveMessage(
            async message => {
                await this.handleMessage(message);
            },
            undefined,
            this.context.subscriptions
        );
    }

    private async handleMessage(message: any): Promise<void> {
        if (!this.panel) {
            return;
        }

        switch (message.type) {
            case 'pickFolder':
                await this.handlePickFolder();
                break;

            case 'runAllSourceRepos':
                await this.handleRunAllSourceRepos();
                break;

            case 'runPipConfig':
                await this.handleRunPipConfig(message.payload?.pipConfigPath);
                break;

            case 'runAllPipConfigs':
                await this.handleRunAllPipConfigs();
                break;

            case 'runSingleRepo':
                await this.handleRunSingleRepo(message.payload?.name);
                break;
        }
    }

    private async handlePickFolder(): Promise<void> {
        if (!this.panel) {
            return;
        }

        const folder = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select PIM configuration folder'
        });

        if (!folder || folder.length === 0) {
            this.selectedFolder = undefined;
            this.lastRepos = [];
            this.lastPipConfigs = [];
            this.panel.webview.postMessage({
                type: 'folderSelected',
                path: ''
            });
            return;
        }

        this.selectedFolder = folder[0];

        this.panel.webview.postMessage({
            type: 'folderSelected',
            path: this.selectedFolder.fsPath
        });

        const rootPath = this.selectedFolder.fsPath;

        const srcConfigPath = findSourceCodeConfig(rootPath);
        if (srcConfigPath) {
            const repos = loadReposFromSourceCodeConfig(srcConfigPath);
            this.lastRepos = repos;

            this.panel.webview.postMessage({
                type: 'sourceCodeRepos',
                payload: repos
            });
            this.panel.webview.postMessage({
                type: 'status',
                text: `Loaded ${repos.length} repositories from ${srcConfigPath}`
            });
        } else {
            this.lastRepos = [];
            this.panel.webview.postMessage({
                type: 'sourceCodeRepos',
                payload: []
            });
            this.panel.webview.postMessage({
                type: 'status',
                text: 'ic-source-code.yml not found under selected folder.'
            });
        }

        const pipConfigs = collectPiPConfigs(rootPath) || [];
        this.lastPipConfigs = pipConfigs;
        this.panel.webview.postMessage({
            type: 'pipConfigs',
            payload: pipConfigs
        });
    }

    private async handleRunAllSourceRepos(): Promise<void> {
        if (!this.panel) {
            return;
        }

        if (!this.lastRepos.length) {
            vscode.window.showWarningMessage('No repositories loaded.');
            return;
        }

        this.panel.webview.postMessage({
            type: 'status',
            text: `Validating ${this.lastRepos.length} repositories...`
        });

        await validateReposInExtension(
            this.lastRepos,
            msg => this.panel?.webview.postMessage(msg)
        );

        this.panel.webview.postMessage({
            type: 'status',
            text: 'Validation finished for all repositories.'
        });
    }

    private async handleRunPipConfig(pipConfigPath: string | undefined): Promise<void> {
        if (!this.panel) {
            return;
        }

        if (!pipConfigPath || !this.lastPipConfigs.length) {
            return;
        }

        const cfg = this.lastPipConfigs.find(
            c => c.pipConfigPath === pipConfigPath
        );
        if (!cfg) {
            return;
        }

        this.panel.webview.postMessage({
            type: 'status',
            text: `Validating packages for "${cfg.dccName}"...`
        });

        const { anyIssues } = await validatePipConfigPackages(
            cfg,
            msg => this.panel?.webview.postMessage(msg)
        );

        const ts = Date.now();
        this.panel.webview.postMessage({
            type: 'pipConfigSummary',
            payload: {
                pipConfigPath: cfg.pipConfigPath,
                anyIssues,
                timestamp: ts
            }
        });

        this.panel.webview.postMessage({
            type: 'status',
            text: `Package validation finished for "${cfg.dccName}".`
        });
    }

    private async handleRunAllPipConfigs(): Promise<void> {
        if (!this.panel) {
            return;
        }

        if (!this.lastPipConfigs.length) {
            vscode.window.showWarningMessage('No PIP configurations loaded.');
            return;
        }

        this.panel.webview.postMessage({
            type: 'status',
            text: `Validating ${this.lastPipConfigs.length} PIP configurations...`
        });

        for (const cfg of this.lastPipConfigs) {
            const { anyIssues } = await validatePipConfigPackages(
                cfg,
                msg => this.panel?.webview.postMessage(msg)
            );

            const ts = Date.now();
            this.panel.webview.postMessage({
                type: 'pipConfigSummary',
                payload: {
                    pipConfigPath: cfg.pipConfigPath,
                    anyIssues,
                    timestamp: ts
                }
            });
        }

        this.panel.webview.postMessage({
            type: 'status',
            text: 'Package validation finished for all PIP configurations.'
        });
    }

    private async handleRunSingleRepo(name: string | undefined): Promise<void> {
        if (!this.panel) {
            return;
        }

        if (!name || !this.lastRepos.length) {
            return;
        }

        const repo = this.lastRepos.find(r => r.name === name);
        if (!repo) {
            return;
        }

        this.panel.webview.postMessage({
            type: 'status',
            text: `Validating repository "${repo.name}"...`
        });

        await validateReposInExtension(
            [repo],
            msg => this.panel?.webview.postMessage(msg)
        );

        this.panel.webview.postMessage({
            type: 'status',
            text: `Validation finished for "${repo.name}".`
        });
    }
}
