// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs')
const templates = require('./template')

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
	let disposable = vscode.commands.registerCommand('template.vue', async function (args) {
		// The code you place here will be executed every time your command is executed

		try {
			const fileName = await vscode.window.showInputBox({
				placeHolder: '请输入 vue 文件名称'
			})

			const selectedPath = args.fsPath
			const newFilePath = `${selectedPath}/${fileName}.vue`

			if (fs.existsSync(newFilePath)) {
				vscode.window.showErrorMessage(`该目录下已存在 ${fileName}.vue 文件`)
				return
			}

			const templateName = await vscode.window.showQuickPick(
				Object.keys(templates),
				{
					canPickMany: false,
					placeHolder: '请选择 vue 模板'
				}
			)

			if (!fs.existsSync(newFilePath)) {
				fs.writeFileSync(newFilePath, templates[templateName])
				let doc = await vscode.workspace.openTextDocument(vscode.Uri.file(newFilePath))
				await vscode.window.showTextDocument(doc)
			} else {
				vscode.window.showErrorMessage(`该目录下已存在 ${fileName}.vue 文件`)
				return
			}
		} catch(error) {
			new Error(error)
      return
		}
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
