const vscode = require('vscode');
const fs = require('fs').promises;
const path = require('path');

const permissionCache = new Set(); // Tracks permissions for specific .env files
const debounceTimers = new Map(); // Tracks debounce timers for each file
const processingFiles = new Set(); // Tracks files currently being processed

const DEBOUNCE_DELAY = 4000; // Delay in milliseconds (4 seconds)

async function showProcessingToast(message) {
	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: message,
			cancellable: false,
		},
		async () => {
			await new Promise((resolve) => setTimeout(resolve)); // Simulate processing time
		}
	);
}

async function showSuccessToast(message) {
	vscode.window.showInformationMessage(message, { modal: false });
}

async function updateEnvExample(envFilePath, envExampleFilePath) {
	try {
		const config = vscode.workspace.getConfiguration('envExample');
		const includeComments = config.get('includeComments', true); // Default to true if not set

		const data = await fs.readFile(envFilePath, 'utf8');
		const envData = data
			.split('\n')
			.map((line) => line.trim())
			.map((line) => {
				if (line.startsWith('#') || !line) {
					return line;
				} else {
					const [key] = line.split('=');
					return includeComments
						? `${key}="" 				# Provide a value for ${key}`
						: `${key}=""`;
				}
			})
			.join('\n');

		await showProcessingToast(`Updating .env.example for ${envFilePath}`);
		await fs.writeFile(envExampleFilePath, envData);
		await showSuccessToast('.env.example file updated successfully.');
	} catch (err) {
		console.error(`Error updating .env.example file: ${err.message}`);
	}
}

async function generateGitignore(workspacePath) {
	const gitignorePath = path.join(workspacePath, '.gitignore');
	const message = `# Environment configuration\n**/.env\n\n# VS Code Configuration\n**/.vscode/\n`;

	try {
		let gitignoreContent = '';

		try {
			gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
		} catch (err) {
			if (err.code === 'ENOENT') {
				await fs.writeFile(gitignorePath, message);
				console.log('.gitignore file created successfully.');
				return;
			}
			throw err;
		}

		if (!gitignoreContent.includes('.env')) {
			gitignoreContent += message;
			await fs.writeFile(gitignorePath, gitignoreContent);
			console.log('Message appended to .gitignore file.');
		} else {
			console.log('Message already exists in .gitignore file.');
		}
	} catch (err) {
		console.error(`Error accessing .gitignore file: ${err.message}`);
	}
}

async function requestPermission(filePath) {
	if (permissionCache.has(filePath)) {
		return true; // Skip prompt if permission already granted for this file
	}

	const userResponse = await vscode.window.showWarningMessage(
		`Do you want to create or update the .env.example and .gitignore files for ${path.basename(filePath)}? You can always do this later, after completing your .env file.`,
		{ modal: true },
		'Yes',
		'No'
	);

	if (userResponse === 'Yes') {
		permissionCache.add(filePath); // Cache the permission for this file
		return true;
	}

	return false;
}

async function handleEnvChange(filePath) {
	if (processingFiles.has(filePath)) {
		return; // Skip if already processing
	}

	processingFiles.add(filePath);

	if (await requestPermission(filePath)) {
		const envExamplePath = path.join(path.dirname(filePath), '.env.example');
		await updateEnvExample(filePath, envExamplePath);

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders && workspaceFolders.length > 0) {
			await generateGitignore(workspaceFolders[0].uri.fsPath);
		}
	}

	processingFiles.delete(filePath);
}

async function toggleIncludeCommentsSetting() {
	const config = vscode.workspace.getConfiguration('envExample');
	const currentValue = config.get('includeComments', true);
	await config.update('includeComments', !currentValue, vscode.ConfigurationTarget.Workspace);
	vscode.window.showInformationMessage(
		`Include comments in .env.example: ${!currentValue ? 'Enabled' : 'Disabled'}`
	);
}

async function activate(context) {
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((e) => {
			const doc = e.document;
			if (doc.fileName.endsWith('.env')) {
				const filePath = doc.fileName;

				// Clear existing debounce timer
				if (debounceTimers.has(filePath)) {
					clearTimeout(debounceTimers.get(filePath));
				}

				// Set a new debounce timer
				const timer = setTimeout(() => {
					handleEnvChange(filePath).catch((err) => {
						console.error(`Error handling .env change: ${err.message}`);
					});
				}, DEBOUNCE_DELAY);

				debounceTimers.set(filePath, timer);
			}
		}),
		vscode.commands.registerCommand('envExample.toggleComments', toggleIncludeCommentsSetting)
	);

	console.log('Extension activated successfully.');
}

function deactivate() {
	debounceTimers.forEach((timer) => clearTimeout(timer));
	console.log('Extension deactivated.');
}

module.exports = {
	activate,
	deactivate,
};
