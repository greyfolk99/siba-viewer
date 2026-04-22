# siba-viewer

VSCode extension for [SIBA](https://github.com/greyfolk99/siba). Live preview, diagnostics, and interactive graph view.

## Prerequisites

- [siba](https://github.com/greyfolk99/siba) CLI installed and in PATH
- [siba-lsp](https://github.com/greyfolk99/siba-lsp) installed and in PATH

## Install

```bash
git clone https://github.com/greyfolk99/siba-viewer.git
cd siba-viewer
npm install
npm run compile
```

## Features

### Live Preview

Open any `.md` file and run `SIBA: Open Preview to the Side`. Shows rendered output with directives processed, variables substituted, control flow evaluated. Auto-refreshes on change.

### Graph View

Run `SIBA: Open Graph View` to see an interactive force-directed graph of your workspace. Calls `siba graph --json` and renders with Canvas.

- Circles = documents (blue)
- Diamonds = templates (purple)
- Solid blue edges = extends
- Gray edges = document references
- Dotted orange edges = variable references
- Drag nodes to rearrange
- Legend in top-right corner

### LSP Diagnostics

Real-time error/warning diagnostics via siba-lsp:
- Template contract violations
- Unresolved references
- Type mismatches
- Circular reference detection

### Commands

| Command | Description |
|---------|-------------|
| `SIBA: Open Preview` | Preview in current tab |
| `SIBA: Open Preview to the Side` | Preview in split view |
| `SIBA: Open Graph View` | Interactive dependency graph |

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `siba-viewer.lspPath` | `"siba-lsp"` | Path to siba-lsp binary |
| `siba-viewer.autoRefresh` | `true` | Auto-refresh preview on change |
| `siba-viewer.refreshDelay` | `300` | Delay (ms) before refresh |

## Related Projects

- [siba](https://github.com/greyfolk99/siba) — Core engine + CLI
- [siba-lsp](https://github.com/greyfolk99/siba-lsp) — LSP + MCP server

## License

MIT
