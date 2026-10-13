import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { buildQuickPickItems } from "../extension";
import type { SnippetInfo } from "../snippet-utils";

suite("Extension Test Suite", () => {
  test("shows prefix and source on the first line and description below", () => {
    const snippets: SnippetInfo[] = [
      {
        id: "preset#template",
        name: "Template",
        prefix: "v3-ts",
        description: "Built-in Vue template",
        body: "<template />",
        languages: ["vue"],
        isFileTemplate: true,
        source: "Vue Template File（内置预设）",
        kind: "preset",
        filePath: "snippets/vue.json",
      },
      {
        id: "user#local",
        name: "Local snippet",
        prefix: "my-local",
        description: "A local template",
        body: "<template />",
        languages: ["vue"],
        isFileTemplate: false,
        source: "用户片段",
        kind: "user",
        filePath: "User/snippets/vue.json",
      },
    ];

    const items = buildQuickPickItems(snippets);
    assert.equal(items[0].label, "v3-ts");
    assert.equal(items[0].description, "Vue Template File（内置预设）");
    assert.equal(items[0].detail, "Built-in Vue template");
    assert.equal(items[1].label, "my-local");
    assert.equal(items[1].description, "本地");
    assert.equal(items[1].detail, "A local template");
  });

  test("activates and registers the Vemplate command", async () => {
    const extension = vscode.extensions.getExtension("bbwhunter.vemplate");
    assert.ok(extension);
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("vemplate"));
  });
});
