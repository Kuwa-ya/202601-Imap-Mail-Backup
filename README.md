
# IMAPメール自動バックアップ＆仕分けCLIツール

## 概要

IMAPメールサーバから業務メールの添付ファイルを自動取得・選別し、ローカルPCにバックアップ保存・仕分けするNode.js CLIツールです。  
Outlook/Microsoft 365等の設定変更不要、Windowsタスクスケジューラ等で定期実行できます。

---

## 主な特徴

- IMAP (node-imap, mailparser) を利用し、主要メールサービスに対応
- 添付ファイルの自動判定・保存（拡張子/サイズ/送信者/件名等でフィルタ）
- 保存先は送信者ドメインごとに自動仕分け
- ローカルPCのみで完結、クラウド不要
- Windowsタスクスケジューラ等で定期実行可能
- ログ出力（テキスト/JSONL）
- 柔軟なルール設定（受信箱ごとに仕分け・移動も可能）

---

## ディレクトリ構成

```
root/
├─ src/                # 本体ソース
├─ config/             # 設定ファイル（サンプルのみgit管理）
├─ logs/               # ログ出力（.gitignore推奨）
├─ mail-backups/       # バックアップ保存先（.gitignore推奨）
├─ scripts/            # 補助スクリプト
├─ dist/               # ビルド成果物（.gitignore推奨）
├─ package.json
├─ tsconfig.json
├─ README.md
```

---

## セットアップ

1. 依存パッケージのインストール

	 ```powershell
	 npm install
	 ```

2. 設定ファイルの作成

	 - `config/config.json` … IMAP接続情報、保存先など
	 - `config/rules.json` … 添付ファイル判定・仕分けルール

	 サンプル（git管理用）を`config/config.sample.json`, `config/rules.sample.json`として同梱しています。  
	 本番用は`config.json`, `rules.json`にリネームし、**パスワード等は必ず書き換えてください**。

---

## 使い方

### ビルド＆実行

```powershell
npm run build
npm run start
```
またはTypeScriptのまま実行:
```powershell
npx ts-node src/cli/processRules.ts
```

### 定期実行（Windowsタスクスケジューラ例）


#### Node.jsスクリプトを直接実行する場合

- プログラム/スクリプト: `C:\Program Files\nodejs\node.exe`
- 引数: `C:\...\...\ROOT\dist\processRules.js`
- 作業フォルダー: `C:\...\...\ROOT`

#### PowerShellスクリプト（.ps1）経由で実行する場合

- プログラム/スクリプト: `powershell.exe`
- 引数: `-ExecutionPolicy Bypass -File "C:\...\...\ROOT\scripts\run.ps1"`
- 作業フォルダー: `C:\...\...\ROOT`

`scripts/run.ps1` の例:
```powershell
npx ts-node ./src/cli/processRules.ts
```


#### スケジューラへの登録・削除（推奨: 5分ごと実行）

PowerShellスクリプトによるWindowsタスクスケジューラ登録・削除用コマンドを用意しています。

**注意: タスク登録・削除は「管理者として実行」したPowerShellまたはコマンドプロンプトで行ってください。**


【管理者権限でPowerShellを開き、プロジェクトディレクトリに効率よく移動する方法】
1. エクスプローラーでプロジェクトフォルダ（例: imap-mail-backup）を開く
2. アドレスバーに「powershell」または「cmd」と入力しEnter（管理者権限が必要な場合は、
	スタートメニューで「PowerShell」や「コマンドプロンプト」を右クリック→「管理者として実行」を選択し、
	下記コマンドで直接移動）
	```powershell
	cd "C:\...\...\ROOT"
	```
3. 下記コマンドを実行

- タスク登録（5分ごと自動実行・起動時自動実行）:
  ```powershell
  npm run task:create
  ```

- タスク削除:
  ```powershell
  npm run task:delete
  ```


登録されるタスクは `scripts/run.ps1` を5分ごと、かつPC起動時に自動実行します。

---

【スケジュールタスクの状態確認（PowerShell）】
PowerShellで下記コマンドを実行すると、タスクの状態・最終実行時刻・次回実行予定などが確認できます。

```powershell
Get-ScheduledTask -TaskName "ImapMailBackupTask" | Get-ScheduledTaskInfo | Format-List
```

---

## 保存仕様

- 保存先: `mail-backups/ルール指定パス/送信者ドメイン/`
- 添付ファイルはルール・フィルタに従い自動保存
- 仕分けルールは`rules.json`の`folderRules`で柔軟に設定可能

---

## 注意・セキュリティ

- `config/config.json`・`logs/`・`mail-backups/`は**必ず.gitignore**してください
- パスワード等はサンプルから書き換え、公開しないでください
- エラー時はログに記録、致命的エラー時のみ非ゼロ終了

---

## コントリビューション

バグ報告・機能要望・プルリク歓迎です。
設定ファイルや個人情報は公開しないようご注意ください。

---

## 参考

- 本体実装: `src/processRules.ts`
- 設定例: `config/config.sample.json`, `config/rules.sample.json`
