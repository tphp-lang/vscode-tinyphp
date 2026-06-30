'use strict';

import * as path from 'path';
import {
    ExtensionContext, window, commands
} from 'vscode';

let client: any;
let extCtx: ExtensionContext;

export async function activate(ctx: ExtensionContext) {
    extCtx = ctx;

    // Dynamic require to avoid static import initialization issues
    const { LanguageClient, TransportKind, RevealOutputChannelOn } =
        require('vscode-languageclient/node');

    const serverModule = ctx.asAbsolutePath(path.join('server', 'out', 'server.js'));
    const serverOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ['--nolazy', '--inspect=6040'], detached: true } }
    };
    const clientOptions = {
        documentSelector: [
            { language: 'tinyphp', scheme: 'file' },
            { language: 'tinyphp', scheme: 'untitled' }
        ],
        initializationOptions: { storagePath: ctx.storagePath },
        revealOutputChannelOn: RevealOutputChannelOn.Never
    };

    client = new LanguageClient('tinyphp', 'TinyPHP', serverOptions, clientOptions);
    ctx.subscriptions.push(client,
        commands.registerCommand('tinyphp.restart.server', restart));

    await client.start();
    console.log('[TinyPHP] Started');
}

async function restart() {
    if (!client) return;
    await client.stop();
    const { LanguageClient, TransportKind, RevealOutputChannelOn } =
        require('vscode-languageclient/node');
    const serverModule = extCtx.asAbsolutePath(path.join('server', 'out', 'server.js'));
    const serverOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ['--nolazy', '--inspect=6040'], detached: true } }
    };
    client = new LanguageClient('tinyphp', 'TinyPHP', serverOptions, {
        documentSelector: [
            { language: 'tinyphp', scheme: 'file' },
            { language: 'tinyphp', scheme: 'untitled' }
        ],
        initializationOptions: { storagePath: extCtx.storagePath },
        revealOutputChannelOn: RevealOutputChannelOn.Never
    });
    extCtx.subscriptions.push(client);
    await client.start();
    window.showInformationMessage('TinyPHP restarted');
}

export async function deactivate() {
    if (client) await client.stop();
}
