import fs from 'fs';
import path from 'path';
import { appendErrorLog, appendLatestLog, appendTaskLog, writeLatestLog, rotateTaskLog, setupConsoleToTaskLog, type LogConfig } from './logger';
import Imap from 'node-imap';
import { simpleParser, Attachment as MailParserAttachment } from 'mailparser';
import { saveMessage } from './saveToLocal';
import { shouldSaveAttachment } from './attachmentFilter';

function readConfig() {
	const cfgPath = path.resolve(process.cwd(), 'config', 'config.json');
	if (!fs.existsSync(cfgPath)) throw new Error(`config.json not found at ${cfgPath}`);
	return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
}

function readRules() {
	const p = path.resolve(process.cwd(), 'config', 'rules.json');
	if (!fs.existsSync(p)) throw new Error(`rules.json not found at ${p}`);
	return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function addressesToStrings(addrs: any): string[] {
	if (!addrs) return [];
	// mailparser AddressObject形式
	if (Array.isArray(addrs)) {
		return addrs.map(a => a.address ? a.address : String(a));
	}
	if (typeof addrs === 'object') {
		if (Array.isArray(addrs.value)) {
			return addrs.value.map((v: any) => v.address ? v.address : String(v));
		}
		if (addrs.address) return [addrs.address];
		if (addrs.text) return [addrs.text];
	}
	if (typeof addrs === 'string') return [addrs];
	return [String(addrs)];
}

function matchConditions(envelope: any, conditions: any) {
	if (!conditions) {
		console.log('[matchConditions] conditions is falsy → return false');
		return false;
	}

	// recipientEquals: to, cc, bcc で一致判定
	if (conditions.recipientEquals) {
		const tos = addressesToStrings(envelope.to).map(s => s.toLowerCase());
		const ccs = addressesToStrings(envelope.cc).map(s => s.toLowerCase());
		const bccs = addressesToStrings(envelope.bcc).map(s => s.toLowerCase());
		const allRecipients = [...tos, ...ccs, ...bccs];
		if (allRecipients.includes(conditions.recipientEquals.toLowerCase())) {
			return true;
		} else {
			return false;
		}
	}

	// senderEquals: from で一致判定
	if (conditions.senderEquals) {
		const froms = addressesToStrings(envelope.from).map(s => s.toLowerCase());
		if (froms.includes(conditions.senderEquals.toLowerCase())) {
			return true;
		} else {
			return false;
		}
	}

	return false;
}

// メールボックス名から送信/受信を判定（表記ゆれに対応）
function determineMailboxType(mailboxName: string): 'inbox' | 'sent' {
	const lowerName = mailboxName.toLowerCase();
	// "sent"を含むメールボックス名を送信フォルダと判定
	if (lowerName.includes('sent')) {
		return 'sent';
	}
	return 'inbox';
}


// node-imapベースの新しいメイン処理
(async () => {
	try {
		const cfg = readConfig();
		const rules = readRules();
		const logConfig: LogConfig = cfg.logging || {};
		
		// task.logのローテーションを実行（logger.tsで管理）
		rotateTaskLog(logConfig);
		
		// 標準出力をtask.logにも記録するように設定
		setupConsoleToTaskLog(logConfig);
		
		// 実行開始時刻を記録
		appendTaskLog('Start', logConfig);
		
		console.log('processRules: start');
		// 最新実行ログを開始
		writeLatestLog('processRules: start', logConfig);
		const imap = new Imap({
			user: cfg.imap.user,
			password: cfg.imap.password,
			host: cfg.imap.host,
			port: cfg.imap.port,
			tls: cfg.imap.secure,
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

		function searchAsync(criteria: any): Promise<any> {
			return new Promise((resolve, reject) => {
				imap.search(criteria, (err: Error | null, results: any) => {
					if (err) reject(err); else resolve(results);
				});
			});
		}

		function fetchAsync(uids: number | number[], fetchOptions: any): Promise<any[]> {
			return new Promise((resolve, reject) => {
				const messages: any[] = [];
				const f = imap.fetch(uids, fetchOptions);
				f.on('message', (msg: any, seqno: number) => {
					const msgObj: { seqno: number; body?: Buffer; attrs?: any } = { seqno };
					msg.on('body', (stream: any, info: any) => {
						let buffer = Buffer.alloc(0);
						stream.on('data', (chunk: Buffer) => { buffer = Buffer.concat([buffer, chunk]); });
						stream.on('end', () => { msgObj.body = buffer; });
					});
					msg.on('attributes', (attrs: any) => { msgObj.attrs = attrs; });
					msg.on('end', () => { messages.push(msgObj); });
				});
				f.once('error', reject);
				f.once('end', () => resolve(messages));
			});
		}

		imap.connect();
		await new Promise((resolve, reject) => imap.once('ready', resolve));
		console.log('IMAP connection ready');
		appendLatestLog('IMAP connection ready', logConfig);

		for (const rule of rules.folderRules || []) {
			console.log(`Processing rule: ${rule.name} on mailbox ${rule.mailbox}`);
			appendLatestLog(`Processing rule: ${rule.name} on mailbox ${rule.mailbox}`, logConfig);
			await openBoxAsync(rule.mailbox, false);
			const uids = await searchAsync(['ALL']);
			let scanned = 0, matched = 0;
			for (const uid of uids as number[]) {
				scanned++;
				const fetchRes: any[] = await fetchAsync(uid, { bodies: '', struct: true });
				const msg = fetchRes[0];
				if (!msg) continue;
				const parsed = await simpleParser(msg.body);
				const env = parsed;
				const date = parsed.date ? new Date(parsed.date) : null;
				// sinceMinutes: ルール個別設定があればそれを使用、なければ共通設定から
				const sinceMinutes = rule.sinceMinutes !== undefined ? rule.sinceMinutes : rules.sinceMinutes;
				if (sinceMinutes && date) {
					const cutoff = Date.now() - sinceMinutes * 60 * 1000;
					if (date.getTime() < cutoff) {
						continue;
					}
				}
				if (matchConditions(env, rule.conditions)) {
					matched++;
					console.log(` - match uid=${uid} subject=${parsed.subject || ''}`);
					// 添付ファイルフィルタ
					const attachments = [];
					if (Array.isArray(parsed.attachments)) {
						for (const a of parsed.attachments as MailParserAttachment[]) {
							let contentBuf;
							if (a.content && Buffer.isBuffer(a.content)) contentBuf = a.content;
							else if (a.content && typeof (a.content as any).pipe === 'function') {
								const stream = a.content as NodeJS.ReadableStream;
								const chunks: Buffer[] = [];
								for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
								contentBuf = Buffer.concat(chunks);
							} else {
								contentBuf = Buffer.from('');
							}
							const keep = shouldSaveAttachment(a.filename, contentBuf.length, rules);
							if (keep) attachments.push({ filename: a.filename || 'attachment', content: contentBuf });
						}
					}
					// メールボックス種別を判定（保存先分類で使用）
					const mailboxType = determineMailboxType(rule.mailbox);
					// to/cc/bccを文字列に変換
					const toStr = parsed.to ? addressesToStrings(parsed.to).join(', ') : undefined;
					const ccStr = parsed.cc ? addressesToStrings(parsed.cc).join(', ') : undefined;
					const bccStr = parsed.bcc ? addressesToStrings(parsed.bcc).join(', ') : undefined;
					
					const msgRec = {
						messageId: parsed.messageId,
						subject: parsed.subject,
						from: parsed.from ? parsed.from.text : undefined,
						to: toStr,
						cc: ccStr,
						bcc: bccStr,
						date: parsed.date ? parsed.date.toISOString() : undefined,
						headers: parsed.headers ? Object.fromEntries(parsed.headers as any) : undefined,
						body: parsed.text || parsed.html || undefined,
						eml: undefined,
						attachments
					};
					let saved = [];
					try {
						// domainFolderMap: 個別設定が明示的に指定されている場合はそれを使用（空でも）、
						// 未指定の場合は共通設定を使用
						const domainFolderMap = rule.domainFolderMap !== undefined
							? rule.domainFolderMap
							: rules.domainFolderMap;
						
						// backupBase: 個別設定があればそれを使用、なければ共通設定から
						const backupBase = rule.backupBase || rules.backupBase;
						if (!backupBase) {
							throw new Error(`backupBase is not configured. Please set it in rules.json (globally or in rule "${rule.name}")`);
						}
						
						// saveMode: ルール個別設定があればそれを使用、なければ共通設定から
						const saveMode = rule.saveMode || rules.saveMode || 'attachments';
						
						saved = await saveMessage(
							saveMode,
							backupBase,
							rule.targetLocalSubpath || '',
							msgRec,
							domainFolderMap && Object.keys(domainFolderMap).length > 0 ? domainFolderMap : undefined,
							mailboxType
						);
						if (saved && saved.length) console.log(`   saved ${saved.length} files for uid=${uid}`);
						else console.log(`   saveMessage: already saved for uid=${uid}`);
					} catch (e) {
						const errMsg = e instanceof Error ? e.message : String(e);
						console.error('   saveMessage failed:', errMsg);
						appendErrorLog(`saveMessage failed: ${errMsg}`, logConfig);
						appendLatestLog(`   ERROR: saveMessage failed: ${errMsg}`, logConfig);
					}
					// メール移動
					if (rule.targetImapFolder && rule.mailbox !== rule.targetImapFolder) {
						try {
							await new Promise((resolve, reject) => {
								imap.move(uid, rule.targetImapFolder, (err: Error | null) => {
									if (err) reject(err); else resolve(true);
								});
							});
							console.log(`   moved uid=${uid} -> ${rule.targetImapFolder}`);
						} catch (err) {
							const errMsg = err instanceof Error ? err.message : String(err);
							console.error(`   move failed for uid=${uid}:`, errMsg);
							appendErrorLog(`move failed for uid=${uid}: ${errMsg}`, logConfig);
							appendLatestLog(`   ERROR: move failed for uid=${uid}: ${errMsg}`, logConfig);
						}
					} else if (rule.targetImapFolder && rule.mailbox === rule.targetImapFolder) {
						console.log(`   skip move: mailbox and targetImapFolder are the same (${rule.mailbox})`);
					}
				}
			}
			console.log(`  scanned=${scanned} matched=${matched}`);
			appendLatestLog(`  scanned=${scanned} matched=${matched}`, logConfig);
		}
		imap.end();
		console.log('processRules: finished');
		appendTaskLog('End', logConfig);
		appendLatestLog('processRules: finished', logConfig);
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : String(err);
		console.error('Processing failed:', errMsg);
		const cfg = readConfig();
		const logConfig: LogConfig = cfg.logging || {};
		appendTaskLog(`Error: ${errMsg}`, logConfig);
		appendErrorLog(`Processing failed: ${errMsg}`, logConfig);
		appendLatestLog(`ERROR: Processing failed: ${errMsg}`, logConfig);
		process.exit(2);
	}
})();
