
import Imap from 'node-imap';

export async function testConnection(imapConfig: {
	host: string;
	port: number;
	secure: boolean;
	user: string;
	password: string;
}) {
	// node-imapで接続・メールボックス一覧取得
	return new Promise((resolve, reject) => {
		const imap = new Imap({
			user: imapConfig.user,
			password: imapConfig.password,
			host: imapConfig.host,
			port: imapConfig.port,
			tls: imapConfig.secure,
			autotls: 'always',
			tlsOptions: { rejectUnauthorized: false }
		});
		imap.once('ready', function() {
			imap.getBoxes((err: Error | null, boxes: any) => {
				if (err) {
					reject(err);
				} else {
					console.log('Available mailboxes:');
					function printBoxes(boxes: any, prefix = '') {
						for (const name in boxes) {
							console.log(' -', prefix + name);
							if (boxes[name].children) printBoxes(boxes[name].children, prefix + name + '/');
						}
					}
					printBoxes(boxes);
					imap.end();
					resolve(true);
				}
			});
		});
		imap.once('error', function(err: Error) {
			reject(err);
		});
		imap.connect();
	});
}
