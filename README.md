# siba-preview

VSCode extension for [SIBA](https://github.com/greyfolk99/siba). Live preview of rendered SIBA documents with real-time diagnostics.

## Prerequisites

- [siba](https://github.com/greyfolk99/siba) CLI installed
- [siba-lsp](https://github.com/greyfolk99/siba-lsp) installed and in PATH

## Install

From source:

```bash
git clone https://github.com/greyfolk99/siba-preview.git
cd siba-preview
npm install
npm run compile
```

Then install in VSCode: `Extensions > ... > Install from VSIX` or symlink to `~/.vscode/extensions/`.

## Features

### Live Preview

Open any `.md` file and run `SIBA: Open Preview to the Side`. The preview shows the rendered output with all directives processed, variables substituted, and control flow evaluated.

Auto-refreshes on document changes (configurable delay).

### LSP Diagnostics

The extension starts `siba-lsp` automatically, which provides:

- Real-time error/warning diagnostics
- Template contract violations
- Unresolved references
- Type mismatches
- Circular reference detection

### Commands

| Command | Description |
|---------|-------------|
| `SIBA: Open Preview` | Open preview in current tab |
| `SIBA: Open Preview to the Side` | Open preview in split view |

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `siba-preview.lspPath` | `"siba-lsp"` | Path to siba-lsp binary |
| `siba-preview.autoRefresh` | `true` | Auto-refresh preview on change |
| `siba-preview.refreshDelay` | `300` | Delay (ms) before refresh |

## Architecture

```
VSCode
  ├── siba-preview extension
  │     ├── LSP Client → siba-lsp (subprocess, stdio)
  │     └── Webview Preview Panel
  │           └── siba/render request → siba-lsp → siba CLI
  │
  siba-lsp (Go binary)
  │     └── bridge → siba check --json / siba render --json
  │
  siba (Go binary)
        └── parse → validate → render
```

## Related Projects

- [siba](https://github.com/greyfolk99/siba) — Core engine + CLI
- [siba-lsp](https://github.com/greyfolk99/siba-lsp) — LSP server

## License

MIT
