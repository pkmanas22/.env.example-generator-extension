const vscode = require('vscode');
const fs = require('fs').promises;
const path = require('path');

async function showProcessingToast(message) {
	vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: message,
		cancellable: false
	}, async (progress) => {
		await new Promise(resolve => setTimeout(resolve)); // Simulating processing time
	});
}

async function showSuccessToast(message) {
	vscode.window.showInformationMessage(message, { modal: false });
}

async function updateEnvExample(envFilePath, envExampleFilePath) {
	try {
		const data = await fs.readFile(envFilePath, 'utf8');
		const envData = data.split('\n')
			.map(line => line.trim())
			.map(line => {
				if (line.startsWith('#')) {
					return line;
				} else {
					const [key] = line.split('=');
					return `${key}=""`;
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

async function findEnvFiles(dir) {
	let envFiles = [];
	try {
		const files = await fs.readdir(dir);
		for (const file of files) {
			const filePath = path.join(dir, file);
			const stat = await fs.stat(filePath);
			if (stat.isDirectory()) {
				const subEnvFiles = await findEnvFiles(filePath);
				envFiles = envFiles.concat(subEnvFiles);
			} else if (file === '.env') {
				envFiles.push(filePath);
			}
		}
		return envFiles;
	} catch (err) {
		console.error(`Error finding .env files: ${err.message}`);
		return [];
	}
}

async function generateGitignore(workspacePath) {
	const gitignorePath = path.join(workspacePath, '.gitignore');
	const message = `# Environment configuration\n**/.env\n`;

	try {
		let gitignoreContent = '';
		// Check if .gitignore file already exists
		try {
			gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
		} catch (err) {
			// .gitignore file doesn't exist, create it with the message
			if (err.code === 'ENOENT') {
				await fs.writeFile(gitignorePath, message);
				console.log('.gitignore file created successfully.');
				return;
			}
			throw err;
		}

		// Append the message to .gitignore content if not already present
		if (!gitignoreContent.includes(message)) {
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

async function activate(context) {

	// Function to generate and update .env.example file
	async function generateEnvExample(envFilePath) {
		const envFileDir = path.dirname(envFilePath);
		const envExampleFilePath = path.join(envFileDir, '.env.example');
		await updateEnvExample(envFilePath, envExampleFilePath);
	}

	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(async (e) => {
		const doc = e.document;
		if (doc.fileName.endsWith('.env')) {
			const uri = vscode.Uri.file(doc.fileName);
			await generateEnvExample(uri.fsPath);
			await generateGitignore(workspaceFolders[0].uri.fsPath);
		}
	}));

	// Generate .env.example files for existing .env files in the workspace
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (workspaceFolders) {
		for (const folder of workspaceFolders) {
			const envFilePaths = await findEnvFiles(folder.uri.fsPath);
			for (const envFilePath of envFilePaths) {
				const envFileDir = path.dirname(envFilePath);
				const envExampleFilePath = path.join(envFileDir, '.env.example');
				await updateEnvExample(envFilePath, envExampleFilePath);
			}

			// Generate .gitignore file in root workspace if it doesn't exist
			await generateGitignore(folder.uri.fsPath);
		}
	}

	console.log("Extension activated successfully.");
}

function deactivate() {
	console.log("Extension deactivated");
}

module.exports = {
	activate,
	deactivate
};
