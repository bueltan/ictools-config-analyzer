import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('ICTools Config Analyzer');
    }
    return outputChannel;
}

export function logDebug(message: string): void {
    const channel = getOutputChannel();
    channel.appendLine(message);
}

export function disposeLogging(): void {
    if (outputChannel) {
        outputChannel.dispose();
        outputChannel = undefined;
    }
}
