import * as vscode from 'vscode';

export function defaultFinishCondition(self: vscode.QuickPick<vscode.QuickPickItem>) {
    if (self.selectedItems.length == 0 || self.selectedItems[0].label == self.value) {
        return true;
    }
    else {
        self.value = self.selectedItems[0].label;
        return false;
    }
}

export async function autocompletedInputBox<T>(
    arg: {
        completion: (userinput: string) => Iterable<vscode.QuickPickItem>,
        withSelf?: undefined | ((self: vscode.QuickPick<vscode.QuickPickItem>) => any),
        stopWhen?: undefined | ((self: vscode.QuickPick<vscode.QuickPickItem>) => boolean)
    }) {
    const completionFunc = arg.completion;
    const processSelf = arg.withSelf;

    let finishCondition = defaultFinishCondition;
    if (arg.stopWhen != undefined)
        finishCondition = defaultFinishCondition


    const quickPick = vscode.window.createQuickPick();
    quickPick.canSelectMany = false;
    let disposables: vscode.Disposable[] = [];
    let result: string | undefined = undefined; // Initialize result to undefined
    let accepted = false; // Flag to track if accepted via Enter

    if (processSelf !== undefined)
        processSelf(quickPick);

    let makeTask = () => new Promise<string | undefined>(resolve => { // Return type includes undefined
        disposables.push(
            quickPick.onDidChangeValue(directoryOrFile => {
                quickPick.items = Array.from(completionFunc(quickPick.value))
                return 0;
            }),
            quickPick.onDidAccept(() => {
                if (finishCondition(quickPick)) {
                    result = quickPick.value;
                    accepted = true; // Mark as accepted
                    quickPick.hide();
                    // Don't resolve here, let onDidHide handle resolution
                }
            }),
            quickPick.onDidHide(() => {
                quickPick.dispose();
                if (accepted) {
                    resolve(result); // Resolve with the accepted value
                } else {
                    resolve(undefined); // Resolve with undefined if cancelled (e.g., Esc)
                }
            })
        );
        quickPick.show();
    });

    try {
        result = await makeTask(); // Assign the resolved value (string or undefined)
    }
    finally {
        disposables.forEach(d => d.dispose());
    }
    return result; // Return the final result (string or undefined)
}
