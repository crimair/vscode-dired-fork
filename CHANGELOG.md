# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.7] - 2026-01-21

### Changed
- Diredのmtime列(更新日時)の表示仕様をEmacs diredと同様に変更：
  - ファイル更新日時が今年の場合は「月 日 時:分」、今年以外は「月 日 年」(年はスペース＋4桁: " 2025" のように表示)
  - 表で時刻・年の桁数が揃い、可読性が向上

## [0.1.6]

### Changed
- Dired now displays the file modification time (mtime) instead of the status change time (ctime) in the timestamp column. This makes the time display consistent with most Unix ls and Emacs dired implementations.

## [0.1.4] - 2025-08-03

### Fixed
- user/group view.

## [0.1.3] - 2025-06-30

### Added
- Sorting is now available in dired view. You can toggle the sort method with the `s` key.

### Fixed
- The "dired open" command now works correctly.

## [0.1.2] - 2025-06-28

### Added
- `Shift+N` is now an alternative key binding for "create new file" (same as `ctrl+x =`).

### Fixed
- When opening a directory, the cursor is restored to the previous position if it is within the valid range; otherwise, it moves to the first line.

## [0.1.1] - 2025-06-02

### Added
- Ctrl+H path level removal for autocompletedInputBox
- Path hierarchy navigation with Ctrl+H key binding
- Support for multiple consecutive path level removals
- Context-aware key binding that only activates when using Quick Pick input

### Changed
- Enhanced path completion functionality with better navigation

## [0.1.0] - Previous Release

### Added
- Initial fork from vscode-dired
- Quick Pick based input with path completion
- Multiple file operations support
- Batch operations for rename, copy, and delete
- Configurable settings for input behavior
