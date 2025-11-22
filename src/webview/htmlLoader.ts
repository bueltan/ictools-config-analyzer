import * as vscode from 'vscode';
import * as fs from 'fs';

function getNonce(): string {
    const possible =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export function getWebviewContent(
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
