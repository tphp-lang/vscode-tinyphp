'use strict';

import {
    Middleware, HandleDiagnosticsSignature, ConfigurationParams,
    RequestHandler
} from 'vscode-languageclient';
import {
    CancellationToken, workspace, Disposable, Uri
} from 'vscode';

export interface TinyPHPMiddleware extends Middleware, Disposable { }

export function createMiddleware(): TinyPHPMiddleware {

    const toDispose: Disposable[] = [];

    function mergeAssociations(tinyphpAssociations: string[]) {
        let vscodeConfig = workspace.getConfiguration('files');
        if (!vscodeConfig) {
            return tinyphpAssociations;
        }
        let vscodeAssociations = vscodeConfig.get('associations') || {};
        let associationsSet = new Set<string>(tinyphpAssociations);
        for (let [key, val] of Object.entries(vscodeAssociations)) {
            if (val === 'tinyphp') {
                associationsSet.add(key);
            }
        }
        return Array.from(associationsSet);
    }

    function mergeExclude(tinyphpExclude: string[], resource?: string) {
        let resourceUri: Uri | undefined;
        if (resource) {
            resourceUri = Uri.parse(resource);
        }
        let vscodeConfig = workspace.getConfiguration('files', resourceUri || null);
        if (!vscodeConfig) {
            return tinyphpExclude;
        }
        let vscodeExclude = vscodeConfig.get('exclude') || {};
        let excludeSet = new Set<string>(tinyphpExclude);
        for (let [key, val] of Object.entries(vscodeExclude)) {
            if (val) {
                excludeSet.add(key);
            }
        }
        return Array.from(excludeSet);
    }

    function mergeSettings(settings: any[], configurationParams: ConfigurationParams): any[] {
        settings.forEach((v, i) => {
            if (v && v.files && v.files.associations) {
                v.files.associations = mergeAssociations(v.files.associations);
            }
            if (v && v.files && v.files.exclude) {
                v.files.exclude = mergeExclude(
                    v.files.exclude,
                    configurationParams.items[i].scopeUri
                );
            }
        });
        return settings;
    }

    let middleware = <TinyPHPMiddleware>{
        workspace: {
            configuration: (
                params: ConfigurationParams,
                token: CancellationToken,
                next: RequestHandler<ConfigurationParams, any[], void>
            ) => {
                let result = next(params, token);
                if (!isThenable(result)) {
                    return Array.isArray(result) ? mergeSettings(result, params) : result;
                }
                return (<Thenable<any>>result).then(r => {
                    return Array.isArray(r) ? mergeSettings(r, params) : r;
                });
            }
        },

        dispose: Disposable.from(...toDispose).dispose
    };

    return middleware;
}

function isThenable(obj: any): obj is Thenable<any> {
    return obj && obj.then !== undefined;
}
