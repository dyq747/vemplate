// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const config = require('./src/index')

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vemplate" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('vue.template', function (args) {
		// The code you place here will be executed every time your command is executed
		useExtension(args)
			.then(() => {
				// Display a message box to the user
				// vscode.window.showInformationMessage('成功创建 vue 模板文件');
			}).catch((error) => {
				new Error(error)
			})
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
function deactivate() {}

function useExtension(args) {
	return new Promise((resolve, reject) => {
		try {
			if(!vscode.workspace.rootPath) {
				vscode.window.showErrorMessage('请先打开一个工作区！'),
				reject('')
				return
			}
			
			let indexjsPath =  `${args.fsPath}/index.vue`
			if (fs.existsSync(indexjsPath)) {
				indexjsPath = `${args.fsPath}/index_new.vue`
			}

			fs.writeFileSync(indexjsPath, config.template);
			vscode.window.showTextDocument(vscode.Uri.file(indexjsPath))
			
			resolve(indexjsPath)
		} catch(error) {
			reject(error)
		}
	})
}

module.exports = {
	activate,
	deactivate
}
