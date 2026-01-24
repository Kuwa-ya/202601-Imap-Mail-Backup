import fs from 'fs';
import path from 'path';

function ensureDir(dir: string) {
	return fs.promises.mkdir(dir, { recursive: true });
}

function sanitizeFilename(name: string) {
	return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
}

async function uniquePath(dir: string, filename: string) {
	const base = path.join(dir, filename);
	try {
		await fs.promises.access(base, fs.constants.F_OK);
		const ext = path.extname(filename);
		const name = path.basename(filename, ext);
		const t = Date.now();
		return path.join(dir, `${name}_${t}${ext}`);
	} catch (e) {
		return base;
	}
}

export type Attachment = { filename: string; content: Buffer };
export type MessageRecord = {
	messageId?: string;
	subject?: string;
	from?: string;
	date?: string;
	headers?: Record<string, string>;
	body?: string;
	eml?: string;
	attachments?: Attachment[];
};

export async function saveMessage(
	saveMode: string,
	backupBase: string,
	localSubpath: string,
	msg: MessageRecord,
	domainFolderMap?: Record<string, string>
): Promise<string[]> {
	const out: string[] = [];
	const now = new Date();

	// メールの受信・送信日時を優先して日付パスを作成
	let dateObj: Date;
	if (msg.date) {
		const parsedDate = new Date(msg.date);
		if (!isNaN(parsedDate.getTime())) {
			dateObj = parsedDate;
		} else {
			dateObj = now;
		}
	} else {
		dateObj = now;
	}
	const y = String(dateObj.getFullYear());
	const m = String(dateObj.getMonth() + 1).padStart(2, '0');
	const d = String(dateObj.getDate()).padStart(2, '0');
	const datePath = y + m + d;

	// 送信者ドメイン抽出
	let senderDomain = 'unknown';
	if (msg.from) {
		const match = msg.from.match(/@([\w.-]+)/);
		if (match) senderDomain = match[1].toLowerCase();
	}
	let domainFolder = senderDomain;
	// domainFolderMapでマッピングがあればそれを使い、なければドメイン名そのまま
	if (domainFolderMap && domainFolderMap[senderDomain]) {
		domainFolder = domainFolderMap[senderDomain];
	} else {
		domainFolder = senderDomain;
	}

	// 添付ファイル名 or メールタイトル + メッセージID
	let folderName = '';
	const idPart = msg.messageId ? sanitizeFilename(msg.messageId) : String(Date.now());
	if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
		folderName = sanitizeFilename(msg.attachments[0].filename || 'attachment') + '_' + idPart;
	} else {
		folderName = '___NO_ATTACHMENT___' + (msg.subject ? sanitizeFilename(msg.subject).slice(0, 50) : 'no_title') + '_'  + idPart;
	}

	// 保存先パスに domainFolder を追加
	const root = path.join(backupBase, localSubpath || '', domainFolder, datePath + '_' + folderName);
	console.log('[saveToLocal] ensureDir:', root);
	await ensureDir(root);

	// --- 重複保存チェック ---
	// フォルダ内のファイル名で重複判定（messageId + 添付ファイル名 or subject）
	let uniqueKey = "";
	if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
		uniqueKey = sanitizeFilename(msg.attachments[0].filename || 'attachment') + '_' + idPart;
	} else {
		uniqueKey = '___NO_ATTACHMENT___' + (msg.subject ? sanitizeFilename(msg.subject).slice(0, 50) : 'no_title') + '_'  + idPart;
	}
	const files = await fs.promises.readdir(root);
	const exists = files.some(f => f.includes(uniqueKey));
	if (exists) {
		console.log(`[saveToLocal] skip: already exists for key=${uniqueKey}`);
		return [];
	}
	// --- 重複保存チェックここまで ---

	const subjPart = msg.subject ? sanitizeFilename(msg.subject).slice(0, 100) : 'message';

	if (saveMode === 'eml') {
		if (!msg.eml) throw new Error('EML content missing');
		const fname = `${subjPart}_${idPart}.eml`;
		const p = await uniquePath(root, fname);
		await fs.promises.writeFile(p, msg.eml, 'utf8');
		out.push(p);
		console.log(`[saveToLocal] saved eml: ${p}`);
		return out;
	}

	if (saveMode === 'metadata') {
		const metadata = {
			messageId: msg.messageId,
			subject: msg.subject,
			from: msg.from,
			date: msg.date,
			headers: msg.headers
		};
		const fname = `${subjPart}.json`;
		const p = await uniquePath(root, fname);
		await fs.promises.writeFile(p, JSON.stringify(metadata, null, 2), 'utf8');
		out.push(p);
		console.log(`[saveToLocal] saved metadata: ${p}`);
		return out;
	}

	// body+attachments or attachments-only
	if (saveMode === 'body+attachments') {
		// headers
		if (msg.headers) {
			const hf = `${subjPart}_headers.json`;
			const hp = await uniquePath(root, hf);
			await fs.promises.writeFile(hp, JSON.stringify(msg.headers, null, 2), 'utf8');
			out.push(hp);
			console.log(`[saveToLocal] saved headers: ${hp}`);
		}
		// body
		if (msg.body) {
			const bf = `${subjPart}_body.txt`;
			const bp = await uniquePath(root, bf);
			await fs.promises.writeFile(bp, msg.body, 'utf8');
			out.push(bp);
			console.log(`[saveToLocal] saved body: ${bp}`);
		}
	}

	if (saveMode === 'attachments' || saveMode === 'body+attachments') {
		if (Array.isArray(msg.attachments)) {
			for (const a of msg.attachments) {
				const fname = sanitizeFilename(a.filename || 'attachment');
				const pth = await uniquePath(root, fname);
				await fs.promises.writeFile(pth, a.content);
				out.push(pth);
				console.log(`[saveToLocal] saved attachment: ${pth}`);
			}
		}
	}

	return out;
}
