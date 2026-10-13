import { existsSync } from "node:fs";
import * as vscode from "vscode";
import {
  buildFileName,
  filterSnippetsForFile,
  filterSnippetsForLanguage,
  normalizeFileName,
  parseSnippetFile,
  resolveUniquePath,
  sortSnippets,
  tryParseSnippetJson,
  validateFileName,
  type SnippetInfo,
} from "./snippet-utils";

const PREVIEW_SCHEME = "vemplate-preview";
const LAST_SNIPPET_KEY = "vemplate.lastSnippetId";
const TARGET_LANGUAGE = "vue";
const SELF_EXTENSION_ID = "bbwhunter.vemplate";
const SOURCE_ORDER = ["preset", "workspace", "user", "custom", "extension"];

interface SnippetPreview {
  contents: Map<string, string>;
  emitter: vscode.EventEmitter<vscode.Uri>;
}

interface SnippetPickItem extends vscode.QuickPickItem {
  snippet: SnippetInfo;
}

interface SnippetContribution {
  language?: string;
  path?: string;
}

interface SnippetFolderOptions {
  source: string;
  kind: string;
  codeSnippetsOnly?: boolean;
}

export function activate(context: vscode.ExtensionContext): void {
  const preview: SnippetPreview = {
    contents: new Map(),
    emitter: new vscode.EventEmitter<vscode.Uri>(),
  };
  context.subscriptions.push(preview.emitter);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, {
      onDidChange: preview.emitter.event,
      provideTextDocumentContent: (uri) => preview.contents.get(uri.toString()) ?? "",
    }),
  );

  const output = vscode.window.createOutputChannel("Vemplate");
  context.subscriptions.push(output);
  context.subscriptions.push(
    vscode.commands.registerCommand("vemplate", (args: unknown) =>
      createVueFile(context, preview, output, args),
    ),
  );
}

async function createVueFile(
  context: vscode.ExtensionContext,
  preview: SnippetPreview,
  output: vscode.OutputChannel,
  args: unknown,
): Promise<void> {
  const folder = await resolveTargetFolder(args);
  if (!folder) {
    return;
  }

  const fileName = await promptFileName();
  if (!fileName) {
    return;
  }

  const targetPath = resolveUniquePath(
    folder.fsPath,
    buildFileName(fileName),
    existsSync,
  );
  const diagnostics: string[] = [];
  let snippets: SnippetInfo[];
  try {
    snippets = await collectSnippets(context, targetPath, diagnostics);
  } catch (error) {
    void vscode.window.showErrorMessage(`读取 Snippet 失败：${errorMessage(error)}`);
    return;
  }

  writeDiagnostics(output, diagnostics, snippets.length);
  const failed = diagnostics.filter(
    (line) =>
      line.startsWith("解析失败") || line.startsWith("文件读取失败"),
  );
  if (failed.length > 0) {
    const choice = await vscode.window.showWarningMessage(
      `${failed.length} 个 Snippet 文件加载失败，已跳过（共可用 ${snippets.length} 条）`,
      "查看日志",
    );
    if (choice === "查看日志") {
      output.show();
    }
  }

  let snippet: SnippetInfo | undefined;
  if (snippets.length === 0) {
    const choice = await vscode.window.showWarningMessage(
      "没有找到可用的 Snippet，是否创建空白 Vue 文件？",
      { modal: true },
      "创建空白文件",
    );
    if (choice !== "创建空白文件") {
      return;
    }
  } else {
    snippet = await promptSnippet(preview, snippets, fileName);
    if (!snippet) {
      void vscode.window.showInformationMessage("已取消创建");
      return;
    }
  }

  await writeVueFile(context, targetPath, snippet);
}

async function resolveTargetFolder(
  args: unknown,
): Promise<vscode.Uri | undefined> {
  const argUri = Array.isArray(args) ? args[0] : args;
  if (argUri instanceof vscode.Uri) {
    try {
      const stat = await vscode.workspace.fs.stat(argUri);
      if (stat.type === vscode.FileType.Directory) {
        return argUri;
      }
      return vscode.Uri.joinPath(argUri, "..");
    } catch {
      // A stale context-menu target falls through to the normal directory selection.
    }
  }

  const activeEditor = vscode.window.activeTextEditor;
  const activeFileFolder =
    activeEditor?.document.uri.scheme === "file"
      ? vscode.Uri.joinPath(activeEditor.document.uri, "..")
      : undefined;
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri: activeFileFolder,
    openLabel: "在此目录创建 Vue 文件",
  });
  return picked?.[0];
}

async function promptFileName(): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    placeHolder: "请输入 Vue 文件名称",
    value: "TheComponent",
    prompt: "建议以 PascalCase 格式来命名，无需输入 .vue 后缀",
    ignoreFocusOut: true,
    validateInput: validateFileName,
  });
  if (value === undefined) {
    return undefined;
  }
  return normalizeFileName(value) || undefined;
}

async function collectSnippets(
  context: vscode.ExtensionContext,
  targetPath: string,
  diagnostics: string[],
): Promise<SnippetInfo[]> {
  const config = vscode.workspace.getConfiguration("vemplate");
  const extraFoldersValue: unknown = config.get("extraSnippetFolders", []);
  const extraFolders = Array.isArray(extraFoldersValue)
    ? extraFoldersValue.filter((folder): folder is string => typeof folder === "string")
    : [];

  const collected: SnippetInfo[] = [];
  const seen = new Set<string>();
  const add = (snippets: SnippetInfo[]) => {
    for (const snippet of snippets) {
      if (!seen.has(snippet.id)) {
        seen.add(snippet.id);
        collected.push(snippet);
      }
    }
  };

  const packageJSON = asRecord(context.extension.packageJSON);
  const displayName =
    typeof packageJSON.displayName === "string" ? packageJSON.displayName : "Vemplate";
  const presetLabel = `${displayName}（内置预设）`;
  for (const contribution of getSnippetContributions(packageJSON)) {
    const relativePath = (contribution.path ?? "").replace(/^\.\//, "");
    if (!relativePath) {
      continue;
    }
    add(
      await readSnippetFile(
        vscode.Uri.joinPath(context.extensionUri, relativePath),
        { langId: contribution.language, source: presetLabel, kind: "preset" },
        diagnostics,
      ),
    );
  }

  const includeExtensionSnippets = config.get<boolean>(
    "includeExtensionSnippets",
    true,
  );
  if (includeExtensionSnippets) {
    add(await readInstalledExtensionSnippets(context, diagnostics));
  } else {
    diagnostics.push("跳过：已关闭 vemplate.includeExtensionSnippets");
  }

  const userFolder = getUserSnippetsFolder(context);
  if (userFolder) {
    add(
      await readSnippetFolder(
        vscode.Uri.file(userFolder),
        { source: "用户片段", kind: "user" },
        diagnostics,
      ),
    );
  } else {
    diagnostics.push(
      `跳过：无法从 ${context.globalStorageUri.toString()} 推导用户片段目录`,
    );
  }
  for (const folder of extraFolders) {
    add(
      await readSnippetFolder(
        vscode.Uri.file(folder),
        { source: "自定义目录", kind: "custom" },
        diagnostics,
      ),
    );
  }

  for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
    add(
      await readSnippetFolder(
        vscode.Uri.joinPath(workspaceFolder.uri, ".vscode"),
        { source: "工作区片段", kind: "workspace", codeSnippetsOnly: true },
        diagnostics,
      ),
    );
  }

  let snippets = filterSnippetsForLanguage(
    collected,
    TARGET_LANGUAGE,
    false,
  );
  diagnostics.push(
    `汇总：收集 ${collected.length} 条，仅保留可用于 ${TARGET_LANGUAGE} 文件的 ${snippets.length} 条`,
  );
  snippets = filterSnippetsForFile(snippets, targetPath);
  diagnostics.push(`按 include/exclude 过滤后 ${snippets.length} 条`);
  const lastUsedId = context.globalState.get<unknown>(LAST_SNIPPET_KEY);
  return sortSnippets(
    snippets,
    typeof lastUsedId === "string" ? lastUsedId : undefined,
    SOURCE_ORDER,
  );
}

async function readInstalledExtensionSnippets(
  context: vscode.ExtensionContext,
  diagnostics: string[],
): Promise<SnippetInfo[]> {
  const snippets: SnippetInfo[] = [];
  for (const extension of vscode.extensions.all) {
    if (
      extension.id === context.extension.id ||
      extension.id === SELF_EXTENSION_ID
    ) {
      continue;
    }
    const packageJSON = asRecord(extension.packageJSON);
    const contributions = getSnippetContributions(packageJSON);
    if (contributions.length === 0) {
      continue;
    }

    const label =
      (typeof packageJSON.displayName === "string" && packageJSON.displayName) ||
      (typeof packageJSON.name === "string" && packageJSON.name) ||
      extension.id;
    for (const contribution of contributions) {
      const relativePath = (contribution.path ?? "").replace(/^\.\//, "");
      if (!relativePath) {
        continue;
      }
      const localLog: string[] = [];
      const read = await readSnippetFile(
        vscode.Uri.joinPath(extension.extensionUri, relativePath),
        { langId: contribution.language, source: label, kind: "extension" },
        localLog,
      );
      const usable = filterSnippetsForLanguage(read, TARGET_LANGUAGE, false);
      if (usable.length > 0) {
        diagnostics.push(
          `扩展片段：${label}（${extension.id}）-> ${usable.length} 条`,
        );
        snippets.push(...usable);
      } else {
        diagnostics.push(
          ...localLog.filter(
            (line) =>
              line.startsWith("解析失败") ||
              line.startsWith("文件读取失败"),
          ),
        );
      }
    }
  }
  return snippets;
}

function getUserSnippetsFolder(
  context: vscode.ExtensionContext,
): string | undefined {
  const folder = vscode.Uri.joinPath(
    context.globalStorageUri,
    "..",
    "..",
    "snippets",
  );
  return folder.scheme === "file" ? folder.fsPath : undefined;
}

async function readSnippetFolder(
  folderUri: vscode.Uri,
  options: SnippetFolderOptions,
  diagnostics: string[],
): Promise<SnippetInfo[]> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(folderUri);
  } catch {
    diagnostics.push(`跳过：目录不存在或不可读 ${folderUri.fsPath}`);
    return [];
  }

  const snippets: SnippetInfo[] = [];
  for (const [fileName, fileType] of entries) {
    if (fileType !== vscode.FileType.File) {
      continue;
    }
    const lowerName = fileName.toLowerCase();
    const fileUri = vscode.Uri.joinPath(folderUri, fileName);
    if (lowerName.endsWith(".code-snippets")) {
      snippets.push(...(await readSnippetFile(fileUri, options, diagnostics)));
    } else if (!options.codeSnippetsOnly && lowerName.endsWith(".json")) {
      const langId = fileName.slice(0, -".json".length);
      snippets.push(
        ...(await readSnippetFile(
          fileUri,
          { ...options, langId },
          diagnostics,
        )),
      );
    }
  }
  return snippets;
}

async function readSnippetFile(
  fileUri: vscode.Uri,
  options: SnippetFolderOptions & { langId?: string },
  diagnostics: string[],
): Promise<SnippetInfo[]> {
  let text: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(fileUri);
    text = Buffer.from(bytes).toString("utf8");
  } catch (error) {
    diagnostics.push(
      `文件读取失败：${fileUri.fsPath}（${errorMessage(error)}）`,
    );
    return [];
  }
  if (!text.trim()) {
    return [];
  }

  const parsed = tryParseSnippetJson(text);
  if (parsed.error) {
    diagnostics.push(`解析失败：${fileUri.fsPath}（${parsed.error}）`);
    return [];
  }

  const snippets = parseSnippetFile(text, {
    langId: options.langId,
    sourceLabel: options.source,
    sourceKind: options.kind,
    filePath: fileUri.fsPath,
  });
  diagnostics.push(`${options.source}：${fileUri.fsPath} -> ${snippets.length} 条`);
  return snippets;
}

function writeDiagnostics(
  output: vscode.OutputChannel,
  diagnostics: string[],
  total: number,
): void {
  output.appendLine("");
  output.appendLine(
    `[${new Date().toLocaleTimeString()}] 本次可用片段 ${total} 条`,
  );
  for (const line of diagnostics) {
    output.appendLine(`  ${line}`);
  }
}

async function promptSnippet(
  preview: SnippetPreview,
  snippets: SnippetInfo[],
  fileName: string,
): Promise<SnippetInfo | undefined> {
  const previewEnabled = vscode.workspace
    .getConfiguration("vemplate")
    .get<boolean>("previewSnippetContent", true);
  const previewUri = vscode.Uri.parse(`${PREVIEW_SCHEME}:/snippet-preview.vue`);
  const quickPick = vscode.window.createQuickPick<SnippetPickItem>();
  quickPick.title = `为 ${fileName} 选择 Snippet`;
  quickPick.placeholder = "输入关键字可搜索，Esc 取消（不会创建文件）";
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;
  quickPick.keepScrollPosition = true;
  quickPick.items = buildQuickPickItems(snippets);

  return new Promise((resolve) => {
    let selected: SnippetInfo | undefined;
    quickPick.onDidAccept(() => {
      selected = quickPick.selectedItems[0]?.snippet;
      quickPick.hide();
    });
    quickPick.onDidChangeActive((items) => {
      if (previewEnabled && items[0]) {
        void showSnippetPreview(preview, previewUri, items[0].snippet);
      }
    });
    quickPick.onDidHide(() => {
      quickPick.dispose();
      if (previewEnabled) {
        preview.contents.delete(previewUri.toString());
        void closePreviewEditor(previewUri);
      }
      resolve(selected);
    });
    quickPick.show();
  });
}

export function buildQuickPickItems(snippets: SnippetInfo[]): SnippetPickItem[] {
  return snippets.map((snippet) => ({
    label: snippet.prefix || snippet.name,
    description:
      snippet.kind === "preset" || snippet.kind === "extension"
        ? snippet.source
        : "本地",
    detail: snippet.description,
    snippet,
  }));
}

async function showSnippetPreview(
  preview: SnippetPreview,
  previewUri: vscode.Uri,
  snippet: SnippetInfo,
): Promise<void> {
  preview.contents.set(previewUri.toString(), snippet.body);
  preview.emitter.fire(previewUri);
  const editor = await vscode.window.showTextDocument(previewUri, {
    viewColumn: vscode.ViewColumn.Beside,
    preserveFocus: true,
    preview: true,
  });
  if (editor.document.languageId !== TARGET_LANGUAGE) {
    try {
      await vscode.languages.setTextDocumentLanguage(
        editor.document,
        TARGET_LANGUAGE,
      );
    } catch {
      // Vue language support is optional; preview content remains available.
    }
  }
}

async function closePreviewEditor(previewUri: vscode.Uri): Promise<void> {
  const uriString = previewUri.toString();
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (
        input instanceof vscode.TabInputText &&
        input.uri.toString() === uriString
      ) {
        await vscode.window.tabGroups.close(tab, true);
        return;
      }
    }
  }
}

async function writeVueFile(
  context: vscode.ExtensionContext,
  targetPath: string,
  snippet: SnippetInfo | undefined,
): Promise<void> {
  const uri = vscode.Uri.file(targetPath);
  let created = false;
  try {
    await vscode.workspace.fs.writeFile(uri, new Uint8Array(0));
    created = true;
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    if (document.languageId !== TARGET_LANGUAGE) {
      try {
        await vscode.languages.setTextDocumentLanguage(
          document,
          TARGET_LANGUAGE,
        );
      } catch {
        // Vue language support is optional; the file is still a valid .vue file.
      }
    }
    if (snippet) {
      await vscode.commands.executeCommand("editor.action.insertSnippet", {
        snippet: snippet.body,
      });
      await context.globalState.update(LAST_SNIPPET_KEY, snippet.id);
    }
  } catch (error) {
    let cleanupError: string | undefined;
    if (created) {
      try {
        await vscode.workspace.fs.delete(uri, { useTrash: true });
      } catch (cleanupFailure) {
        cleanupError = errorMessage(cleanupFailure);
      }
    }
    const cleanupMessage = cleanupError
      ? `；清理未完成（${cleanupError}）`
      : "";
    void vscode.window.showErrorMessage(
      `创建 Vue 文件失败：${errorMessage(error)}${cleanupMessage}`,
    );
  }
}

function getSnippetContributions(packageJSON: Record<string, unknown>): SnippetContribution[] {
  const contributes = asRecord(packageJSON.contributes);
  const snippets = contributes.snippets;
  if (!Array.isArray(snippets)) {
    return [];
  }
  return snippets.flatMap((value) => {
    const contribution = asRecord(value);
    const language =
      typeof contribution.language === "string"
        ? contribution.language
        : undefined;
    const snippetPath =
      typeof contribution.path === "string" ? contribution.path : undefined;
    return snippetPath ? [{ language, path: snippetPath }] : [];
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function deactivate(): void {}
