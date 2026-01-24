# Task delete script
$taskName = "ImapMailBackupTask"
try {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($null -ne $task) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Host "Scheduled task '$taskName' was deleted."
    } else {
        Write-Host "Scheduled task '$taskName' does not exist."
    }
} catch {
    Write-Host "An error occurred: $_"
}