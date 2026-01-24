# Run mailbox accessibility check
Set-Location -Path $PSScriptRoot\\..
Write-Host "Checking configured mailboxes..."
npm run start --silent
