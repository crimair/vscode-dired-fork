'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

var Mode = require('stat-mode');
import DiredProvider from './provider';
import { IDResolver } from './idResolver';
import { URL, pathToFileURL } from 'url';

export enum SortOrder {
    Alphabetical,
    Mtime,
    Ext,
    Size
}

export default class FileItem {

    constructor(
        private _dirname: string,
        private _filename: string,
        public stat: fs.Stats | null, // Make stat public and nullable
        private _isDirectory: boolean = false,
        private _isFile: boolean = true,
        private _username: string | undefined = undefined,
        private _groupname: string | undefined = undefined,
        private _size: number = 0,
        private _month: number = 0,
        private _day: number = 0,
        private _hour: number = 0,
        private _min: number = 0,
        private _modeStr: string | undefined = undefined,
        private _selected: boolean = false) {}

    static _resolver = new IDResolver();

    public static create(dir: string, filename: string, stats: fs.Stats) {
        const mode = new Mode(stats);
        return new FileItem(
            dir,
            filename,
            stats, // Pass stats to constructor
            mode.isDirectory(),
            mode.isFile(),
            FileItem._resolver.username(stats.uid),
            FileItem._resolver.groupname(stats.gid),
            stats.size,
            stats.mtime.getMonth()+1,
            stats.mtime.getDate(),
            stats.mtime.getHours(),
            stats.mtime.getMinutes(),
            mode.toString(),
            false);
    }

    select(value : boolean) {
        this._selected = value;
    }

    get isSelected(): boolean {
        return this._selected;
    }

    get path(): string {
        return path.join(this._dirname, this._filename);
    }
    get fileName(): string {
        return this._filename;
    }

    public line(): string {
        const u = (this._username + "        ").substring(0, 8);
        const g = (this._groupname + "        ").substring(0, 8);
        const size = this.pad(this._size, 8, " ");
        const month = this.pad(this._month, 2, "0");
        const day = this.pad(this._day, 2, "0");
        const hour = this.pad(this._hour, 2, "0");
        const min = this.pad(this._min, 2, "0");
        let se = " ";
        if (this._selected) {
            se = "*";
        }
        return `${se} ${this._modeStr} ${u} ${g} ${size} ${month} ${day} ${hour}:${min} ${this._filename}`;
    }

    public static parseLine(dir: string, line: string): FileItem {
        if (line.length < 52) {
            throw new Error("Line is too short to parse as a FileItem");
        }
        const filename = line.substring(52);
        const username = line.substring(13, 13 + 8).trim();
        const groupname = line.substring(22, 22 + 8).trim();
        const sizeStr = line.substring(31, 31 + 8).trim();
        const size = parseInt(sizeStr);
        const monthStr = line.substring(40, 40 + 2);
        const month = parseInt(monthStr);
        const dayStr = line.substring(43, 43 + 2);
        const day = parseInt(dayStr);
        const hourStr = line.substring(46, 46 + 2);
        const hour = parseInt(hourStr);
        const minStr = line.substring(49, 49 + 2);
        const min = parseInt(minStr);
        const modeStr = line.substring(2, 2 + 10);
        const isDirectory = (modeStr.substring(0, 1) === "d");
        const isFile = (modeStr.substring(0, 1) === "-");
        const isSelected = (line.substring(0, 1) === "*");

        if (isNaN(size) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(min)) {
            throw new Error(`Failed to parse numeric values from line: ${line}`);
        }

        return new FileItem(
            dir,
            filename,
            null, // stat is not available here
            isDirectory,
            isFile,
            username || undefined,
            groupname || undefined,
            size,
            month,
            day,
            hour,
            min,
            modeStr,
            isSelected);
    }

    public get uri(): vscode.Uri | undefined {
        const p = path.join(this._dirname, this._filename);
        if (this._isDirectory) {
            return vscode.Uri.parse(`${DiredProvider.scheme}://${p}`);
        } else if (this._isFile) {
            const u = pathToFileURL(p);
            return vscode.Uri.parse(u.href);
        }
        return undefined;
    }

    pad(num:number, size:number, p: string): string {
        var s = num+"";
        while (s.length < size) s = p + s;
        return s;
    }
}