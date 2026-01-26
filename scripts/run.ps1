# Run mailbox accessibility check
Set-Location -Path "$PSScriptRoot\.."
$log = "$PSScriptRoot\..\logs\task.log"
$npm = "npm"  # 必要なら絶対パスに変更
"$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) Start" | Out-File -FilePath $log -Append
try {
    & $npm run start --silent *>> $log
    "$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) End" | Out-File -FilePath $log -Append
} catch {
    "$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) Error: $_" | Out-File -FilePath $log -Append
}