


import * as vscode from 'vscode';

import { getOutputChannel, disposeLogging } from './utils/logging';
import { WebviewManager } from './webview/webviewManager';

export function activate(context: vscode.ExtensionContext) {
    // Ensure output channel is created once
    getOutputChannel();

    const webviewManager = new WebviewManager(context);

    const disposable = vscode.commands.registerCommand(
        'ictools-config-analyzer.openWebUI',
        () => {
            webviewManager.open();
        }
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {
    disposeLogging();
}




