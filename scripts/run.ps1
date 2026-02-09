# Run mailbox accessibility check
Set-Location -Path "$PSScriptRoot\.."
$npm = "npm"  # 必要なら絶対パスに変更

# ログ管理は logger.ts で行われるため、ここでは実行のみ
& $npm run start --silent