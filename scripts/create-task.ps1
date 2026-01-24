# タスク作成スクリプト
# 推奨: 5分ごとに実行、かつPC起動時にも自動で開始
$taskName = "ImapMailBackupTask"
$vbsPath = Join-Path $PSScriptRoot "run_silent.vbs"
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument ("`"$vbsPath`"")
# 5分ごとトリガー
$trigger1 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5 ) -RepetitionDuration ([TimeSpan]::FromDays(3650))
# 起動時トリガー
$trigger2 = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($trigger1, $trigger2) -Description "Imap Mail Backup runs every 5 minutes and at startup" -Force

if ($?) {
    Write-Host "Scheduled task '$taskName' (every 5 min, at startup) was created successfully."
} else {
    Write-Host "Failed to create scheduled task '$taskName'."
    Write-Host $Error[0]
}