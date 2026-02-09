import fs from 'fs';
import path from 'path';

export type LogConfig = {
	maxLogSizeMB?: number;      // ログファイルの最大サイズ（MB）
	retentionDays?: number;      // ログ保持日数
};

const DEFAULT_CONFIG: Required<LogConfig> = {
	maxLogSizeMB: 10,
	retentionDays: 30
};

function getLogDir(): string {
	return path.resolve(process.cwd(), 'logs');
}

function ensureLogDir(): void {
	const logDir = getLogDir();
	if (!fs.existsSync(logDir)) {
		fs.mkdirSync(logDir, { recursive: true });
	}
}

/**
 * ログファイルのサイズをチェックし、必要に応じてローテーション
 */
function rotateLogIfNeeded(logPath: string, config: Required<LogConfig>): void {
	try {
		if (!fs.existsSync(logPath)) return;

		const stats = fs.statSync(logPath);
		const maxSizeBytes = config.maxLogSizeMB * 1024 * 1024;

		if (stats.size >= maxSizeBytes) {
			// 既存のログファイルをローテーション
			const ext = path.extname(logPath);
			const base = path.basename(logPath, ext);
			const dir = path.dirname(logPath);
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

			// 古いログファイルをリネーム
			const rotatedPath = path.join(dir, `${base}_${timestamp}${ext}`);
			fs.renameSync(logPath, rotatedPath);

			// 古いログファイルを削除（保持数を超える場合）
			cleanupOldLogs(dir, base, ext, config);
		}
	} catch (err) {
		// ローテーション失敗は無視（ログ出力は続行）
		console.error('[logger] rotateLogIfNeeded failed:', err);
	}
}

/**
 * 古いログファイルを削除
 */
function cleanupOldLogs(logDir: string, baseName: string, ext: string, config: Required<LogConfig>): void {
	try {
		const files = fs.readdirSync(logDir);
		// ベースファイル（task.log）とローテーション済みファイル（task_*.log）を分離
		const baseFile = files.find(f => f === `${baseName}${ext}`);
		const rotatedFiles = files
			.filter(f => f.startsWith(`${baseName}_`) && f.endsWith(ext))
			.map(f => ({
				name: f,
				path: path.join(logDir, f),
				time: fs.statSync(path.join(logDir, f)).mtime.getTime()
			}))
			.sort((a, b) => b.time - a.time); // 新しい順

		// 保持日数を超えるローテーション済みファイルを削除（ベースファイルは常に保持）
		const cutoffTime = Date.now() - config.retentionDays * 24 * 60 * 60 * 1000;
		for (const file of rotatedFiles) {
			if (file.time < cutoffTime) {
				try {
					fs.unlinkSync(file.path);
				} catch (err) {
					console.error(`[logger] Failed to delete old log: ${file.name}`, err);
				}
			}
		}
	} catch (err) {
		console.error('[logger] cleanupOldLogs failed:', err);
	}
}

/**
 * エラーログを追記
 */
export function appendErrorLog(message: string, config?: LogConfig): void {
	const finalConfig = { ...DEFAULT_CONFIG, ...config };
	ensureLogDir();
	const logPath = path.join(getLogDir(), 'error.log');
	rotateLogIfNeeded(logPath, finalConfig);
	const now = new Date().toISOString();
	fs.appendFileSync(logPath, `[${now}] ${message}\n`, { encoding: 'utf8' });
}

/**
 * 最新実行ログを書き込み（上書き）
 */
export function writeLatestLog(message: string, config?: LogConfig): void {
	const finalConfig = { ...DEFAULT_CONFIG, ...config };
	ensureLogDir();
	const logPath = path.join(getLogDir(), 'latest.log');
	const now = new Date().toISOString();
	fs.writeFileSync(logPath, `[${now}] ${message}\n`, { encoding: 'utf8' });
}

/**
 * 最新実行ログに追記
 */
export function appendLatestLog(message: string, config?: LogConfig): void {
	const finalConfig = { ...DEFAULT_CONFIG, ...config };
	ensureLogDir();
	const logPath = path.join(getLogDir(), 'latest.log');
	const now = new Date().toISOString();
	fs.appendFileSync(logPath, `[${now}] ${message}\n`, { encoding: 'utf8' });
}

/**
 * task.logに追記
 */
export function appendTaskLog(message: string, config?: LogConfig): void {
	const finalConfig = { ...DEFAULT_CONFIG, ...config };
	ensureLogDir();
	const logDir = getLogDir();
	const taskLogPath = path.join(logDir, 'task.log');
	
	// ローテーションチェック
	if (fs.existsSync(taskLogPath)) {
		rotateLogIfNeeded(taskLogPath, finalConfig);
		// ローテーション後に古いファイルのクリーンアップも実行
		cleanupOldLogs(logDir, 'task', '.log', finalConfig);
	}
	
	const now = new Date().toISOString();
	fs.appendFileSync(taskLogPath, `[${now}] ${message}\n`, { encoding: 'utf8' });
}

/**
 * 標準出力をtask.logにも記録するように設定
 */
export function setupConsoleToTaskLog(config?: LogConfig): void {
	const finalConfig = { ...DEFAULT_CONFIG, ...config };
	const originalLog = console.log;
	const originalError = console.error;
	const originalWarn = console.warn;
	
	// console.logをオーバーライド
	console.log = (...args: any[]) => {
		originalLog(...args);
		const message = args.map(arg => 
			typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
		).join(' ');
		appendTaskLog(message, finalConfig);
	};
	
	// console.errorをオーバーライド
	console.error = (...args: any[]) => {
		originalError(...args);
		const message = args.map(arg => 
			typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
		).join(' ');
		appendTaskLog(`ERROR: ${message}`, finalConfig);
	};
	
	// console.warnをオーバーライド
	console.warn = (...args: any[]) => {
		originalWarn(...args);
		const message = args.map(arg => 
			typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
		).join(' ');
		appendTaskLog(`WARN: ${message}`, finalConfig);
	};
}

/**
 * task.logのローテーションを実行
 */
export function rotateTaskLog(config?: LogConfig): void {
	const finalConfig = { ...DEFAULT_CONFIG, ...config };
	ensureLogDir();
	const logDir = getLogDir();
	const taskLogPath = path.join(logDir, 'task.log');
	
	if (fs.existsSync(taskLogPath)) {
		rotateLogIfNeeded(taskLogPath, finalConfig);
		// ローテーション後に古いファイルのクリーンアップも実行
		cleanupOldLogs(logDir, 'task', '.log', finalConfig);
	}
}

/**
 * ログローテーションを実行（手動実行用）
 */
export function rotateLogs(config?: LogConfig): void {
	const finalConfig = { ...DEFAULT_CONFIG, ...config };
	ensureLogDir();
	const logDir = getLogDir();

	// error.logのローテーション
	const errorLogPath = path.join(logDir, 'error.log');
	rotateLogIfNeeded(errorLogPath, finalConfig);

	// task.logのローテーション
	rotateTaskLog(config);
}
