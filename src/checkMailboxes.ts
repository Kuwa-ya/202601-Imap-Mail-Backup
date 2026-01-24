import fs from 'fs';
import path from 'path';
import Imap from 'node-imap';

function readConfig() {
	const cfgPath = path.resolve(process.cwd(), 'config', 'config.json');
	if (!fs.existsSync(cfgPath)) throw new Error(`config.json not found at ${cfgPath}`);
	const raw = fs.readFileSync(cfgPath, 'utf8');
	return JSON.parse(raw);
}

(async () => {
	try {
		console.log('[checkMailboxes] Start');
		const cfg = readConfig();
		const imapCfg = cfg.imap;
		if (!imapCfg) throw new Error('Missing imap section in config.json');

		const imap = new Imap({
			user: imapCfg.user,
			password: imapCfg.password,
			host: imapCfg.host,
			port: imapCfg.port,
			tls: imapCfg.secure,
			autotls: 'always',
			tlsOptions: { rejectUnauthorized: false }
		});

		function openBoxAsync(boxName: string, readOnly: boolean = false): Promise<any> {
			return new Promise((resolve, reject) => {
				imap.openBox(boxName, readOnly, (err: Error | null, box: any) => {
					if (err) reject(err); else resolve(box);
				});
			});
		}

		function getBoxesAsync(): Promise<any> {
			return new Promise((resolve, reject) => {
				imap.getBoxes((err: Error | null, boxes: any) => {
					if (err) reject(err); else resolve(boxes);
				});
			});
		}

		imap.once('ready', async () => {
			try {
				console.log('[checkMailboxes] IMAP ready');
				const boxes = await getBoxesAsync();
				// Flatten mailbox paths
				function flattenBoxes(boxes: any, prefix = ''): string[] {
					let paths: string[] = [];
					for (const [name, box] of Object.entries(boxes)) {
						const path = prefix ? `${prefix}${name}` : name;
						paths.push(path);
						if ((box as any).children) {
							paths = paths.concat(flattenBoxes((box as any).children, path + (box as any).delimiter));
						}
					}
					return paths;
				}
				const mailboxPaths = flattenBoxes(boxes);
				mailboxPaths.forEach(p => console.log('[mailbox]', p));

				const names = mailboxPaths.map((b: string) => b.toLowerCase());
				const targets = [cfg.mailbox, cfg.sentMailbox].filter(Boolean) as string[];
				for (const t of targets) {
					const found = names.some((n: string) => n === t.toLowerCase() || n.endsWith('/' + t.toLowerCase()));
					if (found) {
						console.log(`[check] ${t}: accessible`);
					} else {
						console.log(`[check] ${t}: NOT FOUND`);
					}
				}
				imap.end();
				process.exit(0);
			} catch (err: any) {
				console.error('[checkMailboxes] Error in ready handler:', err.message || err);
				imap.end();
				process.exit(2);
			}
		});
		imap.once('error', (err: any) => {
			console.error('[checkMailboxes] IMAP error:', err.message || err);
			process.exit(2);
		});
		console.log('[checkMailboxes] Connecting to IMAP...');
		imap.connect();
	} catch (err: any) {
		console.error('[checkMailboxes] Fatal error:', err.message || err);
		process.exit(2);
	}
})();
