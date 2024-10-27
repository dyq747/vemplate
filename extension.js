// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const fs = require("fs");

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "template" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with  registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand(
    "vemplate",
    async function (args) {
      // The code you place here will be executed every time your command is executed

      try {
        let fileName = await vscode.window.showInputBox({
          placeHolder: "请输入 Vue 文件名称",
          value: "TheComponent",
          prompt: "建议以 PascalCase 格式来命名",
          ignoreFocusOut: true,
        });
        let path = `${args.fsPath}/${fileName}.vue`;
        while (fs.existsSync(path)) {
          fileName += " copy";
          path = `${args.fsPath}/${fileName}.vue`;
        }
        const uri = vscode.Uri.file(path);
        await vscode.workspace.fs.writeFile(uri, new Uint8Array(0));
        await vscode.window.showTextDocument(uri);
        await vscode.commands.executeCommand("editor.action.insertSnippet");
      } catch (error) {
        new Error(error);
        return;
      }
    }
  );

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
