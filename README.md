# vscode-dired-fork

*vscode-dired-fork* is a forked File Manager (or Directory Editor) for VS Code.

![vscode-dired Demo](https://github.com/crimair/vscode-dired-fork/raw/master/vscode-dired.gif)

This is a fork of the original [vscode-dired](https://github.com/shirou/vscode-dired), which is a port from Emacs dired-mode.

## Features

- Keyboard-driven file management.
- Open files or directories.
- Create, rename, copy, move, and delete files and directories.
- Mark multiple items for batch operations (rename/move, copy, delete).
- Toggle visibility of dotfiles.
- Optional Quick Pick based input with path completion for commands like open, rename, and copy.

## Configuration

Configure these settings in your VS Code `settings.json`:

- `dired.fixed_window` (boolean, default: `false`): Open dired in the same tab (`true`) or a new tab (`false`).
- `dired.ask_directory` (boolean, default: `true`): Ask for the directory path when opening dired (`true`) or use the current workspace root/active file's directory (`false`).
- `dired.useQuickPickInput` (boolean, default: `false`): Enable Quick Pick based input with path completion for commands like open, rename, and copy.
- `dired.setInitialPathInInput` (boolean, default: `false`): Set the current item's path as the initial value in the input box for rename and copy commands (only applies when `dired.useQuickPickInput` is `false`).

## Key Binding

Default keybindings (when the dired buffer is focused):

- `ctrl+x f`: Open dired. Prompts for a directory or file path.
- `enter`: Open the file or directory under the cursor.
- `.` : Toggle visibility of dotfiles (files starting with '.').
- `shift+=` (`+`): Create a new directory.
- `ctrl+x =`: Create a new file. Uses Quick Pick input if enabled.
- `shift+r` (`R`): Rename the item under the cursor or move selected items to a new directory. Uses Quick Pick input if enabled.
- `shift+c` (`C`): Copy the item under the cursor or copy selected items to a new directory. Uses Quick Pick input if enabled.
- `shift+d` (`D`): Delete the item under the cursor or delete selected items (with confirmation).
- `shift+b` (`B`): Go to the parent directory.
- `m`: Mark (select) the item under the cursor.
- `u`: Unmark (unselect) the item under the cursor.
- `shift+u` (`U`): Unmark (unselect) all marked items.
- `g`: Refresh the current directory contents.
- `q`: Close the dired buffer.

## LICENSE

Apache-2.0
