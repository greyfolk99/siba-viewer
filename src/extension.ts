import * as vscode from 'vscode';
import { execSync } from 'child_process';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;
let previewPanel: vscode.WebviewPanel | undefined;
let graphPanel: vscode.WebviewPanel | undefined;
let refreshTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Start LSP client
  startLanguageClient(context);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('siba-viewer.openPreview', () => {
      openPreview(context, vscode.ViewColumn.Active);
    }),
    vscode.commands.registerCommand('siba-viewer.openPreviewToSide', () => {
      openPreview(context, vscode.ViewColumn.Beside);
    }),
    vscode.commands.registerCommand('siba-viewer.openGraph', () => {
      openGraph(context);
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
  const config = vscode.workspace.getConfiguration('siba-viewer');
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

// --- Preview ---

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
  const config = vscode.workspace.getConfiguration('siba-viewer');
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

// --- Graph View ---

interface GraphData {
  nodes: { id: string; name: string; path: string; is_template: boolean; variables: number; headings: number }[];
  edges: { source: string; target: string; type: string }[];
}

function openGraph(context: vscode.ExtensionContext) {
  if (graphPanel) {
    graphPanel.reveal(vscode.ViewColumn.Beside);
    refreshGraph();
    return;
  }

  graphPanel = vscode.window.createWebviewPanel(
    'sibaGraph',
    'SIBA Graph',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [],
    }
  );

  graphPanel.onDidDispose(() => {
    graphPanel = undefined;
  });

  refreshGraph();
}

function refreshGraph() {
  if (!graphPanel) return;

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) {
    graphPanel.webview.html = renderError('No workspace folder open');
    return;
  }

  try {
    const output = execSync('siba tree --deps --json', {
      cwd: workspaceFolder,
      encoding: 'utf-8',
      timeout: 10000,
    });

    const envelope = JSON.parse(output);
    const data: GraphData = envelope.data;
    graphPanel.webview.html = renderGraph(data);
  } catch (err) {
    graphPanel.webview.html = renderError(
      err instanceof Error ? err.message : String(err)
    );
  }
}

function renderGraph(data: GraphData): string {
  const graphJSON = JSON.stringify(data);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SIBA Graph</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-foreground, #ccc);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    canvas { display: block; }
    .legend {
      position: absolute;
      top: 12px;
      right: 12px;
      background: var(--vscode-sideBar-background, #252526);
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 12px;
      line-height: 1.8;
    }
    .legend-item { display: flex; align-items: center; gap: 8px; }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .legend-line {
      width: 20px;
      height: 2px;
      flex-shrink: 0;
    }
    .stats {
      position: absolute;
      bottom: 12px;
      left: 12px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #888);
    }
  </style>
</head>
<body>
  <canvas id="graph"></canvas>
  <div class="legend">
    <div class="legend-item"><div class="legend-dot" style="background:#4fc3f7"></div> Document</div>
    <div class="legend-item"><div class="legend-dot" style="background:#ab47bc"></div> Template</div>
    <div class="legend-item"><div class="legend-line" style="background:#42a5f5"></div> extends</div>
    <div class="legend-item"><div class="legend-line" style="background:#78909c"></div> reference</div>
    <div class="legend-item"><div class="legend-line" style="background:#ffa726; border-style:dotted"></div> variable ref</div>
  </div>
  <div class="stats" id="stats"></div>

  <script>
    const data = ${graphJSON};
    const canvas = document.getElementById('graph');
    const ctx = canvas.getContext('2d');
    const stats = document.getElementById('stats');

    let width, height;
    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', () => { resize(); draw(); });

    stats.textContent = data.nodes.length + ' documents, ' + data.edges.length + ' edges';

    // Force-directed layout
    const nodes = data.nodes.map((n, i) => ({
      ...n,
      x: width/2 + (Math.random() - 0.5) * 300,
      y: height/2 + (Math.random() - 0.5) * 300,
      vx: 0,
      vy: 0,
    }));

    const nodeMap = {};
    nodes.forEach(n => nodeMap[n.id] = n);

    const edges = data.edges.filter(e => nodeMap[e.source] && nodeMap[e.target]);

    // Simulation
    function simulate() {
      const k = 0.01;     // spring constant
      const repulsion = 5000;
      const damping = 0.9;
      const idealLen = 120;

      // Repulsion between all pairs
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i+1; j < nodes.length; j++) {
          let dx = nodes[j].x - nodes[i].x;
          let dy = nodes[j].y - nodes[i].y;
          let dist = Math.sqrt(dx*dx + dy*dy) || 1;
          let force = repulsion / (dist * dist);
          let fx = (dx / dist) * force;
          let fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      // Spring force for edges
      for (const e of edges) {
        const s = nodeMap[e.source];
        const t = nodeMap[e.target];
        if (!s || !t) continue;
        let dx = t.x - s.x;
        let dy = t.y - s.y;
        let dist = Math.sqrt(dx*dx + dy*dy) || 1;
        let force = k * (dist - idealLen);
        let fx = (dx / dist) * force;
        let fy = (dy / dist) * force;
        s.vx += fx;
        s.vy += fy;
        t.vx -= fx;
        t.vy -= fy;
      }

      // Center gravity
      for (const n of nodes) {
        n.vx += (width/2 - n.x) * 0.001;
        n.vy += (height/2 - n.y) * 0.001;
      }

      // Apply velocity
      for (const n of nodes) {
        n.vx *= damping;
        n.vy *= damping;
        n.x += n.vx;
        n.y += n.vy;
        // bounds
        n.x = Math.max(40, Math.min(width - 40, n.x));
        n.y = Math.max(40, Math.min(height - 40, n.y));
      }
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      // Draw edges
      for (const e of edges) {
        const s = nodeMap[e.source];
        const t = nodeMap[e.target];
        if (!s || !t) continue;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);

        switch (e.type) {
          case 'extends':
            ctx.strokeStyle = '#42a5f5';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            break;
          case 'variable_ref':
            ctx.strokeStyle = '#ffa726';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            break;
          case 'section_ref':
            ctx.strokeStyle = '#78909c';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            break;
          default:
            ctx.strokeStyle = '#78909c';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrowhead
        const angle = Math.atan2(t.y - s.y, t.x - s.x);
        const headLen = 8;
        const tx = t.x - Math.cos(angle) * 16;
        const ty = t.y - Math.sin(angle) * 16;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - headLen * Math.cos(angle - 0.4), ty - headLen * Math.sin(angle - 0.4));
        ctx.lineTo(tx - headLen * Math.cos(angle + 0.4), ty - headLen * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
      }

      // Draw nodes
      for (const n of nodes) {
        const r = n.is_template ? 14 : 10;

        // Node circle
        ctx.beginPath();
        if (n.is_template) {
          // Diamond for templates
          ctx.moveTo(n.x, n.y - r);
          ctx.lineTo(n.x + r, n.y);
          ctx.lineTo(n.x, n.y + r);
          ctx.lineTo(n.x - r, n.y);
          ctx.closePath();
          ctx.fillStyle = '#ab47bc';
        } else {
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#4fc3f7';
        }
        ctx.fill();

        // Label
        ctx.fillStyle = '#e0e0e0';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        const label = n.name || n.path;
        ctx.fillText(label, n.x, n.y + r + 14);
      }
    }

    // Animation loop
    let frame = 0;
    function loop() {
      simulate();
      draw();
      frame++;
      if (frame < 300) {
        requestAnimationFrame(loop);
      }
    }
    loop();

    // Drag interaction
    let dragging = null;
    canvas.addEventListener('mousedown', (e) => {
      const mx = e.clientX, my = e.clientY;
      for (const n of nodes) {
        if (Math.hypot(n.x - mx, n.y - my) < 20) {
          dragging = n;
          break;
        }
      }
    });
    canvas.addEventListener('mousemove', (e) => {
      if (dragging) {
        dragging.x = e.clientX;
        dragging.y = e.clientY;
        dragging.vx = 0;
        dragging.vy = 0;
        draw();
      }
    });
    canvas.addEventListener('mouseup', () => { dragging = null; });
  </script>
</body>
</html>`;
}

// --- Shared rendering ---

interface RenderResult {
  content: string;
  error?: string;
}

function renderMarkdown(content: string, fileName: string): string {
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
    pre code { background: none; padding: 0; }
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
  <div class="siba-meta">SIBA Viewer — live render</div>
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
    <h3>Error</h3>
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

    if (inList && !line.match(/^(\s*[-*+]|\s*\d+\.)\s/)) {
      result.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
    }

    const trimmed = line.trim();

    if (trimmed === '') {
      if (!inList) result.push('');
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      result.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (trimmed.match(/^(---+|___+|\*\*\*+)$/)) {
      result.push('<hr>');
      continue;
    }

    if (trimmed.startsWith('>')) {
      result.push(`<blockquote><p>${inlineFormat(trimmed.slice(1).trim())}</p></blockquote>`);
      continue;
    }

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

    result.push(`<p>${inlineFormat(trimmed)}</p>`);
  }

  if (inCodeBlock) result.push('</code></pre>');
  if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');

  return result.join('\n');
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}
