import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;
let previewPanel: vscode.WebviewPanel | undefined;
let refreshTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Start LSP client
  startLanguageClient(context);

  // Register preview commands
  context.subscriptions.push(
    vscode.commands.registerCommand('siba-preview.openPreview', () => {
      openPreview(context, vscode.ViewColumn.Active);
    }),
    vscode.commands.registerCommand('siba-preview.openPreviewToSide', () => {
      openPreview(context, vscode.ViewColumn.Beside);
    })
  );

  // Auto-refresh on document change
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId === 'markdown' && previewPanel) {
        scheduleRefresh(e.document);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.languageId === 'markdown' && previewPanel) {
        scheduleRefresh(editor.document);
      }
    })
  );
}

export function deactivate(): Thenable<void> | undefined {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  if (client) {
    return client.stop();
  }
  return undefined;
}

function startLanguageClient(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('siba-preview');
  const lspPath = config.get<string>('lspPath', 'siba-lsp');

  const serverOptions: ServerOptions = {
    command: lspPath,
    args: [],
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'markdown' }],
  };

  client = new LanguageClient(
    'siba-lsp',
    'SIBA Language Server',
    serverOptions,
    clientOptions
  );

  client.start();
}

function openPreview(context: vscode.ExtensionContext, column: vscode.ViewColumn) {
  if (previewPanel) {
    previewPanel.reveal(column);
  } else {
    previewPanel = vscode.window.createWebviewPanel(
      'sibaPreview',
      'SIBA Preview',
      column,
      {
        enableScripts: false,
        localResourceRoots: [],
      }
    );

    previewPanel.onDidDispose(() => {
      previewPanel = undefined;
    });
  }

  const editor = vscode.window.activeTextEditor;
  if (editor?.document.languageId === 'markdown') {
    updatePreview(editor.document);
  }
}

function scheduleRefresh(document: vscode.TextDocument) {
  const config = vscode.workspace.getConfiguration('siba-preview');
  const autoRefresh = config.get<boolean>('autoRefresh', true);
  if (!autoRefresh) return;

  const delay = config.get<number>('refreshDelay', 300);

  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  refreshTimer = setTimeout(() => {
    updatePreview(document);
  }, delay);
}

async function updatePreview(document: vscode.TextDocument) {
  if (!previewPanel || !client) return;

  try {
    const result = await client.sendRequest<RenderResult>('siba/render', {
      uri: document.uri.toString(),
    });

    if (result.error) {
      previewPanel.webview.html = renderError(result.error);
      return;
    }

    previewPanel.webview.html = renderMarkdown(result.content, document.fileName);
  } catch (err) {
    previewPanel.webview.html = renderError(
      err instanceof Error ? err.message : String(err)
    );
  }
}

interface RenderResult {
  content: string;
  error?: string;
}

function renderMarkdown(content: string, fileName: string): string {
  // Convert markdown to HTML for preview
  // Simple conversion — headings, paragraphs, lists, code blocks
  const html = markdownToHtml(content);
  const title = fileName.split('/').pop() || 'Preview';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: var(--vscode-foreground, #333);
      background: var(--vscode-editor-background, #fff);
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      border-bottom: 1px solid var(--vscode-panel-border, #eee);
      padding-bottom: 0.3em;
    }
    h1 { font-size: 2em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.25em; }
    code {
      background: var(--vscode-textCodeBlock-background, #f5f5f5);
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 0.9em;
    }
    pre {
      background: var(--vscode-textCodeBlock-background, #f5f5f5);
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
    }
    pre code {
      background: none;
      padding: 0;
    }
    blockquote {
      border-left: 3px solid var(--vscode-textBlockQuote-border, #ddd);
      margin-left: 0;
      padding-left: 16px;
      color: var(--vscode-textBlockQuote-foreground, #666);
    }
    ul, ol { padding-left: 2em; }
    hr { border: none; border-top: 1px solid var(--vscode-panel-border, #eee); }
    .siba-meta {
      font-size: 0.8em;
      color: var(--vscode-descriptionForeground, #999);
      border-top: 1px solid var(--vscode-panel-border, #eee);
      padding-top: 8px;
      margin-top: 2em;
    }
  </style>
</head>
<body>
  ${html}
  <div class="siba-meta">SIBA Preview — live render</div>
</body>
</html>`;
}

function renderError(message: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 20px;
      color: var(--vscode-errorForeground, #f44);
    }
    .error-box {
      background: var(--vscode-inputValidation-errorBackground, #fee);
      border: 1px solid var(--vscode-inputValidation-errorBorder, #f44);
      padding: 16px;
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <div class="error-box">
    <h3>Render Error</h3>
    <pre>${escapeHtml(message)}</pre>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let inList = false;
  let listType = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        result.push('</code></pre>');
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        result.push('<pre><code>');
      }
      continue;
    }

    if (inCodeBlock) {
      result.push(escapeHtml(line));
      continue;
    }

    // close list if needed
    if (inList && !line.match(/^(\s*[-*+]|\s*\d+\.)\s/)) {
      result.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
    }

    const trimmed = line.trim();

    // empty line
    if (trimmed === '') {
      if (!inList) result.push('');
      continue;
    }

    // headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      result.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      continue;
    }

    // horizontal rule
    if (trimmed.match(/^(---+|___+|\*\*\*+)$/)) {
      result.push('<hr>');
      continue;
    }

    // blockquote
    if (trimmed.startsWith('>')) {
      result.push(`<blockquote><p>${inlineFormat(trimmed.slice(1).trim())}</p></blockquote>`);
      continue;
    }

    // unordered list
    const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) result.push('</ol>');
        result.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      result.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    // ordered list
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) result.push('</ul>');
        result.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      result.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    // paragraph
    result.push(`<p>${inlineFormat(trimmed)}</p>`);
  }

  if (inCodeBlock) result.push('</code></pre>');
  if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');

  return result.join('\n');
}

function inlineFormat(text: string): string {
  return text
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}
