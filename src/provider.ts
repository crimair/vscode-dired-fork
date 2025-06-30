'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import FileItem, { SortOrder } from './fileItem';
import * as autoBox from './autocompletedInputBox'

const FIXED_URI: vscode.Uri = vscode.Uri.parse('dired://fixed_window');

export default class DiredProvider implements vscode.TextDocumentContentProvider {
    // ディレクトリごとのカーソル位置保存用
    private _cursorPositions: { [dir: string]: number } = {};

    // ディレクトリごとのカーソル位置保存用
    static scheme = 'dired'; // ex: dired://<directory>

    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    private _fixed_window: boolean;
    private _show_dot_files: boolean = true;
    private _sortOrder: SortOrder = SortOrder.Alphabetical;
    private _buffers: string[]; // This is a temporary buffer. Reused by multiple tabs.

    constructor(fixed_window: boolean) {
        this._fixed_window = fixed_window;
        // カーソル位置監視イベント登録
        vscode.window.onDidChangeTextEditorSelection(e => {
            const editor = e.textEditor;
            const doc = editor.document;
            if (doc && doc.uri.scheme === DiredProvider.scheme) {
                const dirLine = doc.lineAt(0).text;
                const match = dirLine.match(/^([^:]+):/);
                if (match) {
                    const dir = match[1];
                    const line = editor.selection.active.line;
                    // 0行目（ヘッダ）は除外
                    if (line > 0) {
                        this._cursorPositions[dir] = line;
                    }
                }
            }
        });
    }

    dispose() {
        this._onDidChange.dispose();
    }

    get onDidChange() {
        return this._onDidChange.event;
    }

    get dirname() {
        const at = vscode.window.activeTextEditor;
        if (!at) {
            return undefined;
        }
        const doc = at.document;
        if (!doc) {
            return undefined;
        }
        const line0 = doc.lineAt(0).text;
        const match = line0.match(/^([^:]+):/);
        return match ? match[1] : undefined;
    }

    toggleDotFiles() {
        this._show_dot_files = !this._show_dot_files;
        this.reload();
    }

    toggleSort() {
        this._sortOrder = (this._sortOrder + 1) % 4; // Cycle through SortOrder enum
        this.reload();
    }

    enter() {
        const f = this.getFile();
        if (!f) {
            return;
        }
        const uri = f.uri;
        if (!uri) {
            return;
        }
        if (uri.scheme !== DiredProvider.scheme) {
            this.showFile(uri);
            return;
        }
        this.openDir(f.path);
    }

    reload() {
        if (!this.dirname) {
            return;
        }
        this.createBuffer(this.dirname)
            .then(() => this._onDidChange.fire(this.uri));
    }

    async createDir(dirname: string) {
        if (this.dirname) {
            const p = path.join(this.dirname, dirname);
            let uri = vscode.Uri.file(p);
            await vscode.workspace.fs.createDirectory(uri);
            this.reload();
        }
    }

    async createFile(filename: string) {
        const uri = vscode.Uri.file(filename);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: false });
        this.reload();
    }

    rename(newName: string) {
        const f = this.getFile();
        if (!f) {
            return;
        }
        if (this.dirname) {
            const sourcePath = f.path;
            let targetPath: string;

            // Determine the absolute target path
            if (path.isAbsolute(newName)) {
                targetPath = newName; // Use the absolute path directly
            } else {
                targetPath = path.resolve(this.dirname, newName); // Resolve relative path based on current dir
            }

            try {
                let finalTargetPath = targetPath;

                // Check if the target path exists and is a directory
                try {
                    const targetStats = fs.statSync(targetPath);
                    if (targetStats.isDirectory()) {
                        // If target is a directory, move the source *into* it
                        finalTargetPath = path.join(targetPath, path.basename(sourcePath));
                    }
                    // If target exists but is not a directory, fs.renameSync will likely throw an error.
                } catch (targetStatErr: any) {
                    if (targetStatErr.code !== 'ENOENT') {
                        // If error is something other than "not found", re-throw it
                        throw targetStatErr;
                    }
                    // Target path doesn't exist, proceed with renaming/moving to finalTargetPath.
                }

                // Ensure the target directory exists before moving the file/directory
                const targetDir = path.dirname(finalTargetPath);
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }

                fs.renameSync(sourcePath, finalTargetPath);
                vscode.window.showInformationMessage(`${f.fileName} is moved to ${finalTargetPath}`);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to move ${f.fileName} to ${targetPath}: ${err.message}`);
            }

            this.reload();
        }
    }

    copy(newName: string) {
        const f = this.getFile();
        if (!f) {
            return;
        }
        if (this.dirname) {
            const sourcePath = f.path;
            let targetPath: string;

            // Determine the absolute target path
            if (path.isAbsolute(newName)) {
                targetPath = newName; // Use the absolute path directly
            } else {
                targetPath = path.resolve(this.dirname, newName); // Resolve relative path based on current dir
            }

            try {
                const sourceStats = fs.statSync(sourcePath);
                let finalTargetPath = targetPath;

                // Check if the target path exists and is a directory
                try {
                    const targetStats = fs.statSync(targetPath);
                    if (targetStats.isDirectory()) {
                        // If target is a directory, append the source basename
                        finalTargetPath = path.join(targetPath, path.basename(sourcePath));
                    }
                    // If target exists but is not a directory, fs.copyFileSync/cpSync will likely throw an error later.
                } catch (targetStatErr: any) {
                     if (targetStatErr.code !== 'ENOENT') {
                        // If error is something other than "not found", re-throw it
                        throw targetStatErr;
                    }
                    // Target path doesn't exist, proceed.
                }

                if (sourceStats.isDirectory()) {
                    // Copy directory recursively
                    fs.cpSync(sourcePath, finalTargetPath, { recursive: true });
                } else {
                    // Copy file
                    const targetDir = path.dirname(finalTargetPath);
                    if (!fs.existsSync(targetDir)) {
                         fs.mkdirSync(targetDir, { recursive: true });
                    }
                    fs.copyFileSync(sourcePath, finalTargetPath);
                }
                vscode.window.showInformationMessage(`${f.fileName} is copied to ${finalTargetPath}`);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to copy ${f.fileName} to ${targetPath}: ${err.message}`);
            }

            this.reload();
        }
    }

    // Add the new copyMultiple method here
    copyMultiple(targetDir: string, items: FileItem[]) {
        if (!this.dirname) {
            return;
        }

        let targetPath: string;
        // Determine the absolute target path
        if (path.isAbsolute(targetDir)) {
            targetPath = targetDir; // Use the absolute path directly
        } else {
            targetPath = path.resolve(this.dirname, targetDir); // Resolve relative path based on current dir
        }

        try {
            // Ensure the target directory exists
            if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(targetPath, { recursive: true });
            } else if (!fs.statSync(targetPath).isDirectory()) {
                vscode.window.showErrorMessage(`Target path ${targetPath} exists but is not a directory.`);
                return;
            }

            let successCount = 0;
            let errorCount = 0;
            const errors: string[] = [];

            for (const item of items) {
                const sourcePath = item.path;
                const finalTargetPath = path.join(targetPath, item.fileName);

                try {
                    const sourceStats = fs.statSync(sourcePath);
                    if (sourceStats.isDirectory()) {
                        fs.cpSync(sourcePath, finalTargetPath, { recursive: true });
                    } else {
                        fs.copyFileSync(sourcePath, finalTargetPath);
                    }
                    successCount++;
                } catch (err: any) {
                    errorCount++;
                    errors.push(`Failed to copy ${item.fileName}: ${err.message}`);
                    console.error(`Failed to copy ${sourcePath} to ${finalTargetPath}:`, err);
                }
            }

            if (errorCount > 0) {
                vscode.window.showErrorMessage(`Copied ${successCount} items, but failed to copy ${errorCount} items. Check console for details.`);
                errors.forEach(e => console.error(e)); // Log specific errors
            } else {
                vscode.window.showInformationMessage(`Successfully copied ${successCount} items to ${targetPath}`);
            }

        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to prepare target directory ${targetPath}: ${err.message}`);
        }

        this.reload();
    }

    // Add the new moveMultiple method here
    moveMultiple(targetDir: string, items: FileItem[]) {
        if (!this.dirname) {
            return;
        }

        let targetPath: string;
        // Determine the absolute target path
        if (path.isAbsolute(targetDir)) {
            targetPath = targetDir; // Use the absolute path directly
        } else {
            targetPath = path.resolve(this.dirname, targetDir); // Resolve relative path based on current dir
        }

        try {
            // Ensure the target directory exists
            if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(targetPath, { recursive: true });
            } else if (!fs.statSync(targetPath).isDirectory()) {
                vscode.window.showErrorMessage(`Target path ${targetPath} exists but is not a directory.`);
                return;
            }

            let successCount = 0;
            let errorCount = 0;
            const errors: string[] = [];

            for (const item of items) {
                const sourcePath = item.path;
                const finalTargetPath = path.join(targetPath, item.fileName);

                try {
                    // Prevent moving directory into itself or file onto itself (though unlikely here)
                    if (sourcePath === finalTargetPath || sourcePath === targetPath) {
                        errors.push(`Skipping move: source and destination are the same for ${item.fileName}`);
                        errorCount++;
                        continue;
                    }
                    fs.renameSync(sourcePath, finalTargetPath);
                    successCount++;
                } catch (err: any) {
                    errorCount++;
                    errors.push(`Failed to move ${item.fileName}: ${err.message}`);
                    console.error(`Failed to move ${sourcePath} to ${finalTargetPath}:`, err);
                }
            }

            if (errorCount > 0) {
                vscode.window.showErrorMessage(`Moved ${successCount} items, but failed to move ${errorCount} items. Check console for details.`);
                errors.forEach(e => console.error(e)); // Log specific errors
            } else {
                vscode.window.showInformationMessage(`Successfully moved ${successCount} items to ${targetPath}`);
            }

        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to prepare target directory ${targetPath}: ${err.message}`);
        }

        this.reload();
    }

    // Add the new getSelectedItems method here
    getSelectedItems(): FileItem[] {
        const selectedItems: FileItem[] = [];
        const at = vscode.window.activeTextEditor;
        if (!at || !this.dirname) {
            return selectedItems;
        }
        const doc = at.document;
        if (!doc || doc.uri.scheme !== DiredProvider.scheme) {
            return selectedItems;
        }

        for (let i = 1; i < doc.lineCount; i++) { // Start from line 1 to skip header
            const lineText = doc.lineAt(i).text;
            try {
                const fileItem = FileItem.parseLine(this.dirname, lineText);
                if (fileItem.isSelected) {
                    selectedItems.push(fileItem);
                }
            } catch (e) {
                // Ignore lines that cannot be parsed
                console.warn(`Could not parse line ${i}: ${lineText}`, e);
            }
        }
        return selectedItems;
    }

    delete() {
        const f = this.getFile();
        if (!f) {
            vscode.window.showWarningMessage("No file or directory under cursor to delete.");
            return;
        }
        if (this.dirname) {
            const n = path.join(this.dirname, f.fileName);
            try {
                const stats = fs.statSync(n);
                if (stats.isDirectory()) {
                    fs.rmSync(n, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(n);
                }
                this.reload();
                vscode.window.showInformationMessage(`${f.fileName} was deleted`);
            } catch (err: any) {
                 vscode.window.showErrorMessage(`Failed to delete ${f.fileName}: ${err.message}`);
            }
        }
    }

    // Add the new deleteMultiple method
    async deleteMultiple(items: FileItem[]) {
        if (!this.dirname) {
            return;
        }

        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        for (const item of items) {
            const itemPath = item.path; // Use the full path from FileItem
            try {
                const stats = fs.statSync(itemPath);
                if (stats.isDirectory()) {
                    fs.rmSync(itemPath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(itemPath);
                }
                successCount++;
            } catch (err: any) {
                errorCount++;
                errors.push(`Failed to delete ${item.fileName}: ${err.message}`);
                console.error(`Failed to delete ${itemPath}:`, err);
            }
        }

        if (errorCount > 0) {
            vscode.window.showErrorMessage(`Deleted ${successCount} items, but failed to delete ${errorCount} items. Check console for details.`);
            errors.forEach(e => console.error(e)); // Log specific errors
        } else {
            vscode.window.showInformationMessage(`Successfully deleted ${successCount} items.`);
        }

        this.reload(); // Refresh the view after deletions
    }

    select() {
        this.selectFiles(true);
    }

    unselect() {
        this.selectFiles(false);
    }

    unselectAll() {
        if (!this.dirname) {
            return;
        }
        const at = vscode.window.activeTextEditor;
        if (!at) {
            return;
        }
        const doc = at.document;
        if (!doc || doc.uri.scheme !== DiredProvider.scheme) {
            return;
        }

        let changed = false;
        for (let i = 1; i < this._buffers.length; i++) { // Start from 1 to skip header
            try {
                const f = FileItem.parseLine(this.dirname, this._buffers[i]);
                if (f.isSelected) {
                    f.select(false);
                    this._buffers[i] = f.line();
                    changed = true;
                }
            } catch (e) {
                // Ignore lines that cannot be parsed
                console.warn(`Could not parse line ${i} for unselectAll: ${this._buffers[i]}`, e);
            }
        }

        if (changed) {
            const uri = this.uri;
            this._onDidChange.fire(uri);
        }
    }

    goUpDir() {
        if (!this.dirname || this.dirname === "/") {
            return;
        }
        const p = path.join(this.dirname, "..");
        this.openDir(p);
    }

    openDir(path: string) {
        const f = new FileItem(path, "", null, true); // Incomplete FileItem just to get URI.
        const uri = f.uri;
        if (uri) {
            this.createBuffer(path)
                .then(() => vscode.workspace.openTextDocument(uri))
                .then(doc => {
                    vscode.window.showTextDocument(
                        doc,
                        this.getTextDocumentShowOptions(true)
                    ).then(editor => {
                        // カーソル位置復元処理
                        const lineCount = doc.lineCount;
                        let targetLine = 0;
                        const saved = this._cursorPositions[path];
                        if (typeof saved === "number" && saved > 0 && saved < lineCount) {
                            targetLine = saved;
                        }
                        const newSelection = new vscode.Selection(targetLine, 0, targetLine, 0);
                        editor.selection = newSelection;
                        editor.revealRange(new vscode.Range(targetLine, 0, targetLine, 0));
                        // 言語モード設定
                        vscode.languages.setTextDocumentLanguage(doc, "dired");
                    });
                });
        }
    }

    showFile(uri: vscode.Uri) {
        vscode.workspace.openTextDocument(uri).then(doc => {
            vscode.window.showTextDocument(doc, this.getTextDocumentShowOptions(false));
        });
        // TODO: show warning when open file failed
        // vscode.window.showErrorMessage(`Could not open file ${uri.fsPath}: ${err}`);
    }

    provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
        return this.render();
    }

    /**
     * Gets the full path of the file/directory under the cursor.
     * Returns undefined if the cursor is not on a valid file/directory line.
     */
    public getPathUnderCursor(): string | undefined {
        const fileItem = this.getFile();
        return fileItem?.path;
    }

    private get uri(): vscode.Uri {
        if (this.dirname) {
            const f = new FileItem(this.dirname, "", null, true); // Incomplete FileItem just to get URI.
            const uri = f.uri;
            if (uri) {
                return uri;
            }
        }
        return FIXED_URI;
    }

    private render(): Thenable<string> {
        return new Promise((resolve) => {
            resolve(this._buffers.join('\n'));
        });
    }

    private createBuffer(dirname: string): Thenable<string[]> {
        return new Promise((resolve) => {
            let files: FileItem[] = [];
            if (fs.statSync(dirname).isDirectory()) {
                try {
                    files = this.readDir(dirname);
                } catch (err) {
                    vscode.window.showErrorMessage(`Could not read ${dirname}: ${err}`);
                }
            }

            const sortOrderName = SortOrder[this._sortOrder];
            this._buffers = [
                `${dirname}: (Sort: ${sortOrderName})`, // header line
            ];
            this._buffers = this._buffers.concat(files.map((f) => f.line()));

            resolve(this._buffers);
        });
    }

    private readDir(dirname: string): FileItem[] {
        const files = fs.readdirSync(dirname);
        let fileItems = <FileItem[]>files.map((filename) => {
            const p = path.join(dirname, filename);
            try {
                const stat = fs.statSync(p);
                return FileItem.create(dirname, filename, stat);
            } catch (err) {
                vscode.window.showErrorMessage(`Could not get stat of ${p}: ${err}`);
                return null;
            }
        }).filter((fileItem) => {
            if (fileItem) {
                if (this._show_dot_files) return true;
                return fileItem.fileName.substring(0, 1) != '.';
            } else {
                return false;
            }
        });

        const dotItem = FileItem.create(dirname, ".", fs.statSync(dirname));
        const dotDotItem = FileItem.create(dirname, "..", fs.statSync(path.join(dirname, "..")));

        const dirs = fileItems.filter(item => item.stat && item.stat.isDirectory() && item.fileName !== '.' && item.fileName !== '..');
        const filez = fileItems.filter(item => item.stat && !item.stat.isDirectory());

        const sortFn = (a: FileItem, b: FileItem) => {
            switch (this._sortOrder) {
                case SortOrder.Mtime:
                    return b.stat!.mtime.getTime() - a.stat!.mtime.getTime();
                case SortOrder.Ext:
                    return path.extname(a.fileName).localeCompare(path.extname(b.fileName));
                case SortOrder.Size:
                    // Directories have no size, so keep them alphabetical
                    if (a.stat!.isDirectory() && b.stat!.isDirectory()) {
                        return a.fileName.localeCompare(b.fileName);
                    }
                    return b.stat!.size - a.stat!.size;
                case SortOrder.Alphabetical:
                default:
                    return a.fileName.localeCompare(b.fileName);
            }
        };

        // Sort directories and files separately
        dirs.sort(sortFn);
        filez.sort(sortFn);

        return [dotItem, dotDotItem].concat(dirs).concat(filez);
    }

    private getFile(): FileItem | null {
        const at = vscode.window.activeTextEditor;
        if (!at) {
            return null;
        }
        const cursor = at.selection.active;
        if (cursor.line < 1) {
            return null;
        }
        const lineText = at.document.lineAt(cursor.line);
        if (this.dirname && lineText) {
            return FileItem.parseLine(this.dirname, lineText.text);
        }
        return null;
    }

    private selectFiles(value: boolean) {
        if (!this.dirname) {
            return;
        }
        const at = vscode.window.activeTextEditor;
        if (!at) {
            return;
        }
        const doc = at.document;
        if (!doc) {
            return;
        }
        this._buffers = [];
        for (let i = 0; i < doc.lineCount; i++) {
            this._buffers.push(doc.lineAt(i).text);
        }

        let start = 0;
        let end = 0;
        let allowSelectDot = false; // Want to copy emacs's behavior exactly

        if (at.selection.isEmpty) {
            const cursor = at.selection.active;
            if (cursor.line === 0) { // Select all
                start = 1;
                end = doc.lineCount;
            } else {
                allowSelectDot = true;
                start = cursor.line;
                end = cursor.line + 1;
                vscode.commands.executeCommand("cursorMove", { to: "down", by: "line" });
            }
        } else {
            start = at.selection.start.line;
            end = at.selection.end.line;
        }

        for (let i = start; i < end; i++) {
            const f = FileItem.parseLine(this.dirname, this._buffers[i]);
            if (f.fileName === "." || f.fileName === "..") {
                if (!allowSelectDot) {
                    continue;
                }
            }
            f.select(value);
            this._buffers[i] = f.line();
        }
        const uri = this.uri;
        this._onDidChange.fire(uri);
    }

    private getTextDocumentShowOptions(fixed_window: boolean): vscode.TextDocumentShowOptions {
        const opts: vscode.TextDocumentShowOptions = {
            preview: fixed_window,
            viewColumn: vscode.ViewColumn.Active
        };
        return opts;
    }
}
