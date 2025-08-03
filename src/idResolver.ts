'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path'

export class IDResolver {
    private _user_cache = new Map<Number, string>();
    private _group_cache = new Map<Number, string>();

    constructor() {
        this.create(true);
        this.create(false);
    }
    username(uid: Number):string | undefined{
        return this._user_cache.get(uid);
    }
    groupname(uid: Number):string | undefined{
        return this._group_cache.get(uid);
    }

    private create(user: boolean){
        const home = require('os').homedir();
        const cache_file = user ? '.vscode-dired-user-cache' : '.vscode-dired-group-cache';
        const cache_path = path.join(home, cache_file);

        // Linux: キャッシュファイルが空なら /etc/passwd, /etc/group から初期化
        if (process.platform === 'linux') {
            if (!fs.existsSync(cache_path) || fs.statSync(cache_path).size === 0) {
                let lines: string[] = [];
                if (user) {
                    // /etc/passwd: name:x:uid:...
                    const passwd = fs.readFileSync('/etc/passwd', 'utf8').split('\n');
                    for (const line of passwd) {
                        const parts = line.split(':');
                        if (parts.length > 2) {
                            lines.push(`${parts[0]}:x:${parts[2]}`);
                        }
                    }
                } else {
                    // /etc/group: name:x:gid:...
                    const group = fs.readFileSync('/etc/group', 'utf8').split('\n');
                    for (const line of group) {
                        const parts = line.split(':');
                        if (parts.length > 2) {
                            lines.push(`${parts[0]}:x:${parts[2]}`);
                        }
                    }
                }
                fs.writeFileSync(cache_path, lines.join('\n'), 'utf8');
            }
        } else {
            // Windows/Mac: キャッシュファイルがなければ空ファイル作成
            if (!fs.existsSync(cache_path)) {
                fs.writeFileSync(cache_path, '');
            }
        }

        // キャッシュファイル読み込み
        const rl = readline.createInterface({
            input: fs.createReadStream(cache_path),
        });
        rl.on('line', (line:string) => {
            const l = line.split(":", 3);
            const name = l[0];
            const uid = parseInt(l[2], 10);
            if (user) {
                this._user_cache.set(uid, name);
            } else {
                this._group_cache.set(uid, name);
            }
        });
    }

    createOnMac(){
        // dscl . -list /Users UniqueID
        // dscl . -list /Groups gid
    }
}