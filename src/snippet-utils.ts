import * as path from "node:path";

export const INVALID_FILE_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/;

export interface SnippetInfo {
  id: string;
  name: string;
  prefix: string;
  description: string;
  body: string;
  languages: string[];
  isFileTemplate: boolean;
  include?: string[];
  exclude?: string[];
  source: string;
  kind: string;
  filePath: string;
}

interface SerializedSnippet {
  body: string | string[];
  prefix?: unknown;
  scope?: unknown;
  description?: unknown;
  isFileTemplate?: unknown;
  include?: unknown;
  exclude?: unknown;
}

export interface ParseSnippetOptions {
  langId?: string;
  sourceLabel?: string;
  sourceKind?: string;
  filePath?: string;
}

export function normalizeFileName(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }
  let name = input.trim();
  while (/\.vue$/i.test(name)) {
    name = name.replace(/\.vue$/i, "").trim();
  }
  return name;
}

export function validateFileName(input: string): string | undefined {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) {
    return "文件名不能为空";
  }
  if (INVALID_FILE_NAME_CHARS.test(raw)) {
    return '文件名不能包含 \\ / : * ? " < > | 等字符';
  }
  const name = normalizeFileName(raw);
  if (!name || /^\.+$/.test(name)) {
    return "请输入合法的文件名";
  }
  if (name.length > 128) {
    return "文件名过长";
  }
  return undefined;
}

export function buildFileName(input: string): string {
  const name = normalizeFileName(input);
  return name ? `${name}.vue` : "";
}

export function resolveUniquePath(
  dirPath: string,
  fileName: string,
  exists: (candidate: string) => boolean,
): string {
  const base = fileName.replace(/\.vue$/i, "");
  const candidates = [`${base}.vue`];
  for (let index = 1; index <= 99; index++) {
    candidates.push(
      index === 1 ? `${base}.copy.vue` : `${base}.copy${index}.vue`,
    );
  }
  for (const candidate of candidates) {
    const target = path.join(dirPath, candidate);
    if (!exists(target)) {
      return target;
    }
  }
  return path.join(dirPath, `${base}.copy${Date.now()}.vue`);
}

export function globToRegExp(pattern: string): RegExp {
  let source = "";
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index++;
      } else {
        source += "[^/\\\\]*";
      }
    } else if (char === "?") {
      source += "[^/\\\\]";
    } else if ("\\^$.|+()[]{}".includes(char)) {
      source += `\\${char}`;
    } else {
      source += char;
    }
  }
  return new RegExp(`^${source}$`, "i");
}

export function isFileIncluded(
  snippet: Pick<SnippetInfo, "include" | "exclude"> | undefined,
  filePath: string | undefined,
): boolean {
  if (!snippet || !filePath) {
    return true;
  }
  const fileName = filePath.split(/[\\/]/).pop() || "";
  const targetOf = (pattern: string) =>
    pattern.includes("/") ? filePath : fileName;

  for (const pattern of snippet.exclude?.filter(Boolean) ?? []) {
    if (globToRegExp(pattern).test(targetOf(pattern))) {
      return false;
    }
  }

  const include = snippet.include?.filter(Boolean) ?? [];
  if (include.length > 0) {
    return include.some((pattern) =>
      globToRegExp(pattern).test(targetOf(pattern)),
    );
  }
  return true;
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
  }
  return [];
}

function firstString(value: unknown): string {
  return toStringArray(value)[0] ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSerializedSnippet(value: unknown): value is SerializedSnippet {
  return (
    isRecord(value) &&
    Boolean(value.body) &&
    (typeof value.body === "string" || Array.isArray(value.body))
  );
}

function pushSnippet(
  bucket: SnippetInfo[],
  name: string,
  snippet: SerializedSnippet,
  options: Required<ParseSnippetOptions>,
): void {
  const body = Array.isArray(snippet.body)
    ? snippet.body.join("\n")
    : snippet.body;
  if (typeof body !== "string") {
    return;
  }

  let languages: string[];
  if (options.langId) {
    languages = [options.langId];
  } else if (typeof snippet.scope === "string") {
    languages = snippet.scope
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean);
  } else {
    languages = [];
  }

  const description = Array.isArray(snippet.description)
    ? snippet.description.join(" ")
    : typeof snippet.description === "string"
      ? snippet.description
      : "";
  const include = toStringArray(snippet.include);
  const exclude = toStringArray(snippet.exclude);

  bucket.push({
    id: `${options.filePath}#${name}`,
    name,
    prefix: firstString(snippet.prefix),
    description,
    body,
    languages,
    isFileTemplate: snippet.isFileTemplate === true,
    include: include.length > 0 ? include : undefined,
    exclude: exclude.length > 0 ? exclude : undefined,
    source: options.sourceLabel,
    kind: options.sourceKind,
    filePath: options.filePath,
  });
}

export function repairJsonc(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      out += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === "/" && text[index + 1] === "/") {
      while (index < text.length && text[index] !== "\n") {
        index++;
      }
      out += "\n";
      continue;
    }

    if (char === "/" && text[index + 1] === "*") {
      index += 2;
      while (
        index < text.length &&
        !(text[index] === "*" && text[index + 1] === "/")
      ) {
        index++;
      }
      index++;
      continue;
    }

    if (char === ",") {
      let next = index + 1;
      while (next < text.length && /\s/.test(text[next])) {
        next++;
      }
      if (text[next] === "}" || text[next] === "]") {
        continue;
      }
    }

    out += char;
  }
  return out;
}

export function tryParseSnippetJson(
  text: string,
): { value: unknown; error: string | undefined } {
  try {
    const cleaned = String(text).replace(/^\uFEFF/, "");
    return { value: JSON.parse(repairJsonc(cleaned)) as unknown, error: undefined };
  } catch (error) {
    return {
      value: undefined,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function parseSnippetFile(
  text: string,
  options: ParseSnippetOptions = {},
): SnippetInfo[] {
  const parsed = tryParseSnippetJson(text);
  if (!isRecord(parsed.value)) {
    return [];
  }

  const normalizedOptions: Required<ParseSnippetOptions> = {
    langId: options.langId ?? "",
    sourceLabel: options.sourceLabel ?? "",
    sourceKind: options.sourceKind ?? "",
    filePath: options.filePath ?? "",
  };
  const result: SnippetInfo[] = [];
  for (const [key, value] of Object.entries(parsed.value)) {
    if (isSerializedSnippet(value)) {
      pushSnippet(result, key, value, normalizedOptions);
    } else if (isRecord(value)) {
      for (const [innerKey, inner] of Object.entries(value)) {
        if (isSerializedSnippet(inner)) {
          pushSnippet(result, innerKey, inner, normalizedOptions);
        }
      }
    }
  }
  return result;
}

export function filterSnippetsForLanguage(
  snippets: SnippetInfo[],
  languageId: string | undefined,
  includeUnscoped = true,
): SnippetInfo[] {
  if (!languageId) {
    return snippets.slice();
  }
  return snippets.filter(
    (snippet) =>
      (includeUnscoped && snippet.languages.length === 0) ||
      snippet.languages.includes(languageId) ||
      (includeUnscoped && snippet.languages.includes("*")),
  );
}

export function filterSnippetsForFile(
  snippets: SnippetInfo[],
  filePath: string | undefined,
): SnippetInfo[] {
  if (!filePath) {
    return snippets.slice();
  }
  return snippets.filter((snippet) => isFileIncluded(snippet, filePath));
}

export function sortSnippets(
  snippets: SnippetInfo[],
  lastUsedId: string | undefined,
  kindOrder: string[] = [],
): SnippetInfo[] {
  const rankOf = (snippet: SnippetInfo) => {
    const index = kindOrder.indexOf(snippet.kind);
    return index < 0 ? kindOrder.length : index;
  };

  return snippets.slice().sort((a, b) => {
    const aLast = lastUsedId !== undefined && a.id === lastUsedId;
    const bLast = lastUsedId !== undefined && b.id === lastUsedId;
    if (aLast !== bLast) {
      return aLast ? -1 : 1;
    }
    const rankA = rankOf(a);
    const rankB = rankOf(b);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    if (a.isFileTemplate !== b.isFileTemplate) {
      return a.isFileTemplate ? -1 : 1;
    }
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}
