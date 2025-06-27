# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
