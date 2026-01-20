'use strict';

import * as vscode from 'vscode';
import DiredProvider from './provider';
import FileItem from './fileItem';

import * as fs from 'fs';
import * as path from 'path';
import { autocompletedInputBox, getCurrentQuickPick, removePathLevel } from './autocompletedInputBox';

export interface ExtensionInternal {
    DiredProvider: DiredProvider,
}

export function activate(context: vscode.ExtensionContext): ExtensionInternal {
    let ask_dir = true;
    const configuration = vscode.workspace.getConfiguration('dired');
    if (configuration.has('ask_directory')) {
        ask_dir = configuration.get('ask_directory', true); // Use get with default
    }
    let fixed_window = false;
    if (configuration.has('fixed_window')) {
        fixed_window = configuration.get('fixed_window', false); // Use get with default
    }
    // Read the new configuration settings
    const useQuickPickInput = configuration.get('useQuickPickInput', false);
    const setInitialPathInInput = configuration.get('setInitialPathInInput', true); // Read the new setting

    const provider = new DiredProvider(fixed_window);

    const providerRegistrations = vscode.Disposable.from(
        vscode.workspace.registerTextDocumentContentProvider(DiredProvider.scheme, provider),
    );

    // Add completionType argument
    function* pathCompletionFunc(filePathOrDirPath: string, completionType: 'all' | 'directory' | 'file' = 'all'): IterableIterator<vscode.QuickPickItem> {
        let dirname: string;
        const baseDir = provider.dirname || vscode.workspace.rootPath || require('os').homedir();
        if (!baseDir) return;

        if (!path.isAbsolute(filePathOrDirPath)) {
            filePathOrDirPath = path.join(baseDir, filePathOrDirPath);
        }

        try {
            let stat = fs.statSync(filePathOrDirPath);
            if (stat.isDirectory()) {
                dirname = filePathOrDirPath;
                // Yield directory if type is 'all' or 'directory'
                if (completionType === 'all' || completionType === 'directory') {
                    yield {
                        detail: "Target directory: " + path.basename(filePathOrDirPath) + "/",
                        label: filePathOrDirPath,
                        buttons: [ { iconPath: vscode.ThemeIcon.Folder } ]
                    };
                }
            } else {
                // Yield file only if type is 'all' or 'file'
                if (completionType === 'all' || completionType === 'file') {
                    yield {
                        detail: "Target file: " + path.basename(filePathOrDirPath),
                        label: filePathOrDirPath,
                        buttons: [ { iconPath: vscode.ThemeIcon.File } ]
                    };
                }
                dirname = path.dirname(filePathOrDirPath);
            }
        } catch {
            // Yield "Create/Rename to" suggestion only if type is 'all' or 'file'
            if (completionType === 'all' || completionType === 'file') {
                yield {
                    detail: "Create/Rename to: " + path.basename(filePathOrDirPath),
                    label: filePathOrDirPath,
                    buttons: [ { iconPath: vscode.ThemeIcon.File } ] // Keep as file icon for creation
                };
            }
            dirname = path.dirname(filePathOrDirPath);
            try {
                fs.accessSync(dirname, fs.constants.F_OK);
            } catch {
                return;
            }
        }        try {
            const dirItems: vscode.QuickPickItem[] = [];
            const fileItems: vscode.QuickPickItem[] = [];
            
            for (let name of fs.readdirSync(dirname)) {
                const fullpath = path.join(dirname, name);
                try {
                    const stat = fs.statSync(fullpath); // Get stat to check type
                    if (stat.isDirectory()) {
                        // Add directory if type is 'all' or 'directory'
                        if (completionType === 'all' || completionType === 'directory') {
                            dirItems.push({
                                label: fullpath, detail: "Open " + name + "/",
                                buttons: [ { iconPath: vscode.ThemeIcon.Folder } ]
                            });
                        }
                    } else {
                        // Add file only if type is 'all' or 'file'
                        if (completionType === 'all' || completionType === 'file') {
                            fileItems.push({
                                label: fullpath, detail: "Open " + name,
                                buttons: [ { iconPath: vscode.ThemeIcon.File } ]
                            });
                        }
                    }
                } catch (statErr) {
                    // Ignore files we can't stat
                }
            }
            
            // Yield directories first, then files
            for (const item of dirItems) yield item;
            for (const item of fileItems) yield item;
        } catch (readDirErr) {
            // Ignore errors reading directory
        }
    }

    const commandOpen = vscode.commands.registerCommand("extension.dired.open", async () => { // Make the command async
        let initialDir = vscode.workspace.rootPath;
        const at = vscode.window.activeTextEditor;
        if (at) {
            if (at.document.uri.scheme === DiredProvider.scheme) {
                initialDir = provider.dirname;
            } else {
                const doc = at.document;
                initialDir = path.dirname(doc.fileName);
            }
        }
        if (!initialDir) {
            initialDir = require('os').homedir();
        }

        if (!ask_dir) {
            if (initialDir) {
                provider.openDir(initialDir);
            }
            return; // Exit if not asking for directory
        }

        let selectedPath: string | undefined;

        if (useQuickPickInput) {
            selectedPath = await autocompletedInputBox({
                // Pass the completion function with the desired type ('all' for now)
                completion: (input) => pathCompletionFunc(input, 'all'),
                withSelf: (self) => {
                    self.title = "Open Directory or File";
                    self.value = initialDir || '';
                    self.placeholder = "Enter path to open";
                    // Trigger initial completion
                    self.items = Array.from(pathCompletionFunc(self.value, 'all'));
                },
            });
        } else {
            // Use the original showInputBox
            selectedPath = await vscode.window.showInputBox({
                value: initialDir,
                valueSelection: initialDir ? [initialDir.length, initialDir.length] : undefined,
                prompt: "Directory or file path to open"
            });
        }

        if (!selectedPath) {
            return; // User cancelled
        }

        try {
            const stat = fs.statSync(selectedPath);
            if (stat.isDirectory()) {
                provider.openDir(selectedPath);
            } else if (stat.isFile()) {
                const f = new FileItem(selectedPath, "", null, false, true); // Incomplete FileItem just to get URI.
                const uri = f.uri;
                if (uri) {
                    provider.showFile(uri);
                }
            }
        } catch (err: any) {
            vscode.window.showErrorMessage(`Error accessing path ${selectedPath}: ${err.message}`);
        }
    });

    const commandEnter = vscode.commands.registerCommand("extension.dired.enter", () => {
        provider.enter();
    });
    const commandToggleDotFiles = vscode.commands.registerCommand("extension.dired.toggleDotFiles", () => {
        provider.toggleDotFiles();
    });

    const commandToggleSort = vscode.commands.registerCommand("extension.dired.toggleSort", () => {
        provider.toggleSort();
    });

    const commandCreateDir = vscode.commands.registerCommand("extension.dired.createDir", async () => {
        let dirName = await vscode.window.showInputBox({ prompt: "Directory name" });
        if (!dirName) {
            return;
        }
        await provider.createDir(dirName);
    });

    const commandRename = vscode.commands.registerCommand("extension.dired.rename", async () => {
        const selectedItems = provider.getSelectedItems();
        const configuration = vscode.workspace.getConfiguration('dired');
        const useQuickPickInput = configuration.get('useQuickPickInput', false);
        const setInitialPathInInput = configuration.get('setInitialPathInInput', true);

        if (selectedItems.length > 1) {
            // Multiple items selected: Move to directory
            let targetDir: string | undefined;
            const initialDirValue = provider.dirname || '';

            if (useQuickPickInput) {
                targetDir = await autocompletedInputBox({
                    // Only show directories for completion
                    completion: (input) => pathCompletionFunc(input, 'directory'),
                    withSelf: (self) => {
                        self.title = `Move ${selectedItems.length} items to Directory`;
                        self.value = initialDirValue;
                        self.placeholder = "Enter target directory path";
                        self.items = Array.from(pathCompletionFunc(self.value, 'directory'));
                    }
                });
            } else {
                targetDir = await vscode.window.showInputBox({
                    value: initialDirValue,
                    prompt: `Enter target directory path to move ${selectedItems.length} items`
                });
            }

            if (targetDir) {
                // Call a new provider method for moving multiple items (to be implemented)
                provider.moveMultiple(targetDir, selectedItems);
            }
        } else {
            // Single item (or cursor position): Original rename/move behavior
            let newName: string | undefined;
            const currentPath = provider.getPathUnderCursor();
            // Determine initial value based on the setting
            const initialValue = setInitialPathInInput ? (currentPath || provider.dirname || '') : '';

            if (useQuickPickInput) {
                newName = await autocompletedInputBox({
                    // Pass the completion function with the desired type ('all' for now)
                    completion: (input) => pathCompletionFunc(input, 'all'),
                    withSelf: (self) => {
                        self.title = "Rename/Move";
                        self.value = initialValue; // Use determined initial value
                        self.placeholder = "Enter new name or path";
                        self.items = Array.from(pathCompletionFunc(self.value, 'all'));
                    }
                });
            } else {
                newName = await vscode.window.showInputBox({
                    value: initialValue, // Use determined initial value
                    prompt: "Enter new name or path for the item under cursor"
                });
            }

            if (newName) {
                provider.rename(newName);
            }
        }
    });

    const commandCopy = vscode.commands.registerCommand("extension.dired.copy", async () => {
        const selectedItems = provider.getSelectedItems();
        const useQuickPickInput = configuration.get('useQuickPickInput', false);
        const setInitialPathInInput = configuration.get('setInitialPathInInput', true);

        if (selectedItems.length > 1) {
            // Multiple items selected: Copy to directory
            let targetDir: string | undefined;
            const initialDirValue = provider.dirname || '';

            if (useQuickPickInput) {
                targetDir = await autocompletedInputBox({
                    // Only show directories for completion
                    completion: (input) => pathCompletionFunc(input, 'directory'),
                    withSelf: (self) => {
                        self.title = `Copy ${selectedItems.length} items to Directory`;
                        self.value = initialDirValue;
                        self.placeholder = "Enter target directory path";
                        self.items = Array.from(pathCompletionFunc(self.value, 'directory'));
                    }
                });
            } else {
                targetDir = await vscode.window.showInputBox({
                    value: initialDirValue,
                    prompt: `Enter target directory path to copy ${selectedItems.length} items`
                });
            }

            if (targetDir) {
                provider.copyMultiple(targetDir, selectedItems);
            }
        } else {
            // Single item (or cursor position): Original copy behavior
            let newName: string | undefined;
            const currentPath = provider.getPathUnderCursor();
            const initialValue = setInitialPathInInput ? (currentPath || provider.dirname || '') : '';

            if (useQuickPickInput) {
                newName = await autocompletedInputBox({
                    // Allow all types for single item copy
                    completion: (input) => pathCompletionFunc(input, 'all'),
                    withSelf: (self) => {
                        self.title = "Copy";
                        self.value = initialValue;
                        self.placeholder = "Enter destination name or path";
                        self.items = Array.from(pathCompletionFunc(self.value, 'all'));
                    }
                });
            } else {
                newName = await vscode.window.showInputBox({
                    value: initialValue,
                    prompt: "Enter destination name or path for the item under cursor"
                });
            }

            if (newName) {
                provider.copy(newName);
            }
        }
    });

    const commandDelete = vscode.commands.registerCommand("extension.dired.delete", async () => { // Make async for potential multiple deletions
        const selectedItems = provider.getSelectedItems();

        if (selectedItems.length > 1) {
            // Multiple items selected
            const confirmation = await vscode.window.showInformationMessage(`Delete ${selectedItems.length} selected items?`, { modal: true }, "Yes", "No");
            if (confirmation === "Yes") {
                await provider.deleteMultiple(selectedItems); // Call the new method
            }
        } else {
            // Single item or no selection (delete item under cursor)
            const fileToDelete = provider.getPathUnderCursor(); // Get path for confirmation message
            const baseName = fileToDelete ? path.basename(fileToDelete) : "this item";
            const confirmation = await vscode.window.showInformationMessage(`Delete ${baseName}?`, { modal: true }, "Yes", "No");
            if (confirmation === "Yes") {
                provider.delete(); // Use existing single delete method
            }
        }
    });

    const commandGoUpDir = vscode.commands.registerCommand("extension.dired.goUpDir", () => {
        provider.goUpDir();
    });
    const commandRefresh = vscode.commands.registerCommand("extension.dired.refresh", () => {
        provider.reload();
    });
    const commandSelect = vscode.commands.registerCommand("extension.dired.select", () => {
        provider.select();
    });
    const commandUnselect = vscode.commands.registerCommand("extension.dired.unselect", () => {
        provider.unselect();
    });
    const commandUnselectAll = vscode.commands.registerCommand("extension.dired.unselectAll", () => {
        provider.unselectAll();
    });    const commandClose = vscode.commands.registerCommand("extension.dired.close", () => {
        vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });    const commandPathLevelUp = vscode.commands.registerCommand("extension.dired.pathLevelUp", () => {
        const quickPick = getCurrentQuickPick();
        if (quickPick) {
            const currentValue = quickPick.value;
            const newValue = removePathLevel(currentValue);
            quickPick.value = newValue;
            // onDidChangeValue event will automatically fire and update completion candidates
        }
    });

    const commandCreateFile = vscode.commands.registerCommand("extension.dired.createFile", async () => {
        // Define a wrapper for the specific completion logic if needed, or pass type directly
        const completionForCreate = (input: string) => pathCompletionFunc(input, 'all'); // Use 'all' for now

        function processSelf(self: vscode.QuickPick<vscode.QuickPickItem>) {
            self.placeholder = "Create File or Open Path" // Adjusted placeholder
        }
        let fileName = await autocompletedInputBox(
            {
                completion: completionForCreate,
                withSelf: (self) => {
                    processSelf(self);
                    // Trigger initial completion
                    self.items = Array.from(completionForCreate(self.value));
                }
            });

        // Check if fileName is defined (not cancelled)
        if (fileName) {
            vscode.window.showInformationMessage(fileName);
            let isDirectory = false;

            try {
                let stat = await fs.promises.stat(fileName);
                if (stat.isDirectory())
                    isDirectory = true;
            }
            catch {
                await fs.promises.mkdir(path.dirname(fileName), { recursive: true })
                await fs.promises.writeFile(fileName, "");
            }

            if (isDirectory) {
                provider.openDir(fileName)
            } else {
                await provider.createFile(fileName)
            }
        }
        // If fileName is undefined (cancelled), do nothing.
    });    context.subscriptions.push(
        provider,
        commandOpen,
        commandEnter,
        commandToggleDotFiles,
        commandToggleSort, // Add this line
        commandCreateDir,
        commandCreateFile,
        commandRename,
        commandCopy,
        commandGoUpDir,
        commandRefresh,
        commandClose,
        commandDelete,
        commandSelect,
        commandUnselect,
        commandUnselectAll,
        commandPathLevelUp,
        providerRegistrations
    );

    vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && editor.document.uri.scheme === DiredProvider.scheme) {
            editor.options = {
                cursorStyle: vscode.TextEditorCursorStyle.Block,
            };
            vscode.commands.executeCommand('setContext', 'dired.open', true);
        } else {
            vscode.commands.executeCommand('setContext', 'dired.open', false);
        }
    });

    return {
        DiredProvider: provider,
    };
}
