import * as assert from "node:assert/strict";
import * as path from "node:path";
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
} from "../snippet-utils";

suite("snippet-utils", () => {
  test("normalizes and validates Vue file names", () => {
    assert.equal(normalizeFileName("  Page.vue.vue "), "Page");
    assert.equal(buildFileName("Page.vue"), "Page.vue");
    assert.equal(validateFileName(""), "文件名不能为空");
    assert.ok(validateFileName("foo/bar"));
    assert.equal(validateFileName("MyPage.vue"), undefined);
  });

  test("generates a copy name when the requested file already exists", () => {
    const taken = new Set([
      path.join("src", "Page.vue"),
      path.join("src", "Page.copy.vue"),
    ]);
    assert.equal(
      resolveUniquePath("src", "Page.vue", (candidate) => taken.has(candidate)),
      "src\\Page.copy2.vue",
    );
  });

  test("parses scoped snippets and joins body arrays", () => {
    const snippets = parseSnippetFile(
      JSON.stringify({
        "Vue page": {
          body: ["<template>", "$1", "</template>"],
          prefix: ["vue-page", "vp"],
          description: ["Vue", "page"],
          scope: "vue, html",
          isFileTemplate: true,
        },
      }),
      { filePath: "snippets/vue.code-snippets", sourceLabel: "User" },
    );
    assert.equal(snippets.length, 1);
    assert.equal(snippets[0].body, "<template>\n$1\n</template>");
    assert.deepEqual(snippets[0].languages, ["vue", "html"]);
    assert.equal(snippets[0].prefix, "vue-page");
    assert.equal(snippets[0].description, "Vue page");
    assert.equal(snippets[0].isFileTemplate, true);
  });

  test("accepts JSONC comments, trailing commas, and a BOM", () => {
    const parsed = tryParseSnippetJson(
      '\uFEFF{\n// preset\n"Vue": { "body": ["<template>", "</template>",], },\n}',
    );
    assert.equal(parsed.error, undefined);
    assert.equal(
      parseSnippetFile(
        '\uFEFF{"Vue": {"body": ["<template>", "</template>",],},}',
      )[0].body,
      "<template>\n</template>",
    );
  });

  test("filters snippets by language and target file", () => {
    const snippets = parseSnippetFile(
      JSON.stringify({
        Vue: { body: "$1", scope: "vue", include: "*.vue" },
        Global: { body: "$1" },
        Python: { body: "$1", scope: "python" },
        Tests: { body: "$1", scope: "vue", exclude: "Test*.vue" },
      }),
      { filePath: "snippets/vue.code-snippets" },
    );
    const languageMatches = filterSnippetsForLanguage(snippets, "vue");
    assert.deepEqual(
      languageMatches.map((snippet) => snippet.name),
      ["Vue", "Global", "Tests"],
    );
    assert.deepEqual(
      filterSnippetsForFile(languageMatches, "src/TestPage.vue").map(
        (snippet) => snippet.name,
      ),
      ["Vue", "Global"],
    );
  });

  test("keeps only snippets explicitly scoped to Vue", () => {
    const snippets = parseSnippetFile(
      JSON.stringify({
        Vue: { body: "$1", scope: "vue" },
        Global: { body: "$1" },
        Any: { body: "$1", scope: "*" },
        Python: { body: "$1", scope: "python" },
      }),
    );

    assert.deepEqual(
      filterSnippetsForLanguage(snippets, "vue", false).map(
        (snippet) => snippet.name,
      ),
      ["Vue"],
    );
  });

  test("sorts by last use, source priority, template status, then name", () => {
    const snippets: SnippetInfo[] = [
      {
        id: "extension", name: "Alpha", kind: "extension", isFileTemplate: true,
        prefix: "", description: "", body: "", languages: [], source: "", filePath: "",
      },
      {
        id: "workspace", name: "Zulu", kind: "workspace", isFileTemplate: false,
        prefix: "", description: "", body: "", languages: [], source: "", filePath: "",
      },
      {
        id: "preset", name: "Beta", kind: "preset", isFileTemplate: false,
        prefix: "", description: "", body: "", languages: [], source: "", filePath: "",
      },
      {
        id: "recent", name: "Recent", kind: "extension", isFileTemplate: false,
        prefix: "", description: "", body: "", languages: [], source: "", filePath: "",
      },
    ];
    assert.deepEqual(
      sortSnippets(snippets, "recent", ["preset", "workspace", "extension"]).map(
        (snippet) => snippet.id,
      ),
      ["recent", "preset", "workspace", "extension"],
    );
  });
});
