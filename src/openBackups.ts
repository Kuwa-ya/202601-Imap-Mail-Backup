import fs from 'fs';
import path from 'path';
import { exec, spawn } from 'child_process';

function readRules() {
	const p = path.resolve(process.cwd(), 'config', 'rules.json');
	if (!fs.existsSync(p)) {
		console.error(`rules.json not found at ${p}`);
		process.exit(1);
	}
	return JSON.parse(fs.readFileSync(p, 'utf8'));
}

try {
	const rules = readRules();
	const backupBase = rules.backupBase;
	
	if (!backupBase) {
		console.error('backupBase is not configured in rules.json');
		process.exit(1);
	}
	
	// パスを正規化（相対パスの場合は絶対パスに変換）
	const normalizedPath = path.isAbsolute(backupBase) 
		? path.normalize(backupBase)
		: path.resolve(process.cwd(), backupBase);
	
	// フォルダの存在確認
	if (!fs.existsSync(normalizedPath)) {
		console.error(`Backup folder does not exist: ${normalizedPath}`);
		process.exit(1);
	}
	
	// Windowsのエクスプローラーで開く（パスを正規化してから）
	if (process.platform === 'win32') {
		// Windowsではspawnを使用（explorer.exeは非同期で実行されるため）
		const explorer = spawn('explorer.exe', [normalizedPath], {
			detached: true,
			stdio: 'ignore'
		});
		explorer.unref(); // 親プロセスから切り離す
		console.log(`Opening backup folder: ${normalizedPath}`);
	} else if (process.platform === 'darwin') {
		exec(`open "${normalizedPath}"`, (error) => {
			if (error) {
				console.error(`Failed to open backup folder: ${error.message}`);
				process.exit(1);
			}
		});
	} else {
		exec(`xdg-open "${normalizedPath}"`, (error) => {
			if (error) {
				console.error(`Failed to open backup folder: ${error.message}`);
				process.exit(1);
			}
		});
	}
} catch (err) {
	const errMsg = err instanceof Error ? err.message : String(err);
	console.error(`Error: ${errMsg}`);
	process.exit(1);
}
