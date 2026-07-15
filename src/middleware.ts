'use strict';

// 参考 Intelephense 的 middleware 模式：合并 VSCode 的 files.associations 和
// files.exclude 设置到 TinyPHP LSP 服务端，使设置保持同步。
//
// 注意：vscode-tinyphp 客户端使用 dynamic require 加载 vscode-languageclient，
// 因此本文件中所有从 vscode-languageclient 引入的类型都用 dynamic require
// 获取，避免静态 import 在客户端未编译时初始化失败。

import {
    CancellationToken, workspace, Disposable, Uri,
} from 'vscode';

export interface TinyPHPMiddleware {
    workspace?: {
        configuration?: (
            params: any,
            token: CancellationToken,
            next: (params: any, token: CancellationToken) => any
        ) => any;
    };
    dispose?: () => void;
}

function isThenable(obj: any): obj is Thenable<any> {
    return obj && typeof obj.then === 'function';
}

// 合并 VSCode files.associations 中映射到 tinyphp 的扩展名
function mergeAssociations(tinyphpAssociations: string[]): string[] {
    const vscodeConfig = workspace.getConfiguration('files');
    if (!vscodeConfig) return tinyphpAssociations;

    const vscodeAssociations = vscodeConfig.get('associations') || {};
    const set = new Set<string>(tinyphpAssociations);
    for (const [key, val] of Object.entries(vscodeAssociations)) {
        if (val === 'tinyphp' || val === 'php') {
            set.add(key);
        }
    }
    return Array.from(set);
}

// 合并 VSCode files.exclude 中的排除模式
function mergeExclude(tinyphpExclude: string[], resource?: string): string[] {
    let resourceUri: Uri | undefined;
    if (resource) {
        try { resourceUri = Uri.parse(resource); } catch { /* ignore */ }
    }
    const vscodeConfig = workspace.getConfiguration('files', resourceUri || null);
    if (!vscodeConfig) return tinyphpExclude;

    const vscodeExclude = vscodeConfig.get('exclude') || {};
    const set = new Set<string>(tinyphpExclude);
    for (const [key, val] of Object.entries(vscodeExclude)) {
        if (val) {
            set.add(key);
        }
    }
    return Array.from(set);
}

// 在 workspace/configuration 请求中合并设置
function mergeSettings(settings: any[], configurationParams: any): any[] {
    settings.forEach((v, i) => {
        if (v && v.files && v.files.associations) {
            v.files.associations = mergeAssociations(v.files.associations);
        }
        if (v && v.files && v.files.exclude) {
            const scopeUri = configurationParams?.items?.[i]?.scopeUri;
            v.files.exclude = mergeExclude(v.files.exclude, scopeUri);
        }
    });
    return settings;
}

export function createMiddleware(): TinyPHPMiddleware & Disposable {
    const toDispose: Disposable[] = [];

    const middleware: TinyPHPMiddleware & Disposable = {
        workspace: {
            configuration: (
                params: any,
                token: CancellationToken,
                next: (p: any, t: CancellationToken) => any
            ) => {
                const result = next(params, token);
                if (!isThenable(result)) {
                    return Array.isArray(result) ? mergeSettings(result, params) : result;
                }
                return (result as Thenable<any>).then(r =>
                    Array.isArray(r) ? mergeSettings(r, params) : r
                );
            }
        },
        dispose: Disposable.from(...toDispose).dispose
    };

    return middleware;
}
