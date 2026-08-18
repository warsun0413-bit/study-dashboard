param(
    [Parameter(Mandatory = $true)]
    [string]$ExpectedApiVersion
)

$ErrorActionPreference = "SilentlyContinue"

function Read-LocalUrl([string]$Url) {
    try {
        $request = [System.Net.HttpWebRequest]::Create($Url)
        $request.Proxy = $null
        $request.Timeout = 2000
        $response = $request.GetResponse()
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        $text = $reader.ReadToEnd()
        $reader.Dispose()
        $response.Dispose()
        return $text
    } catch {
        return $null
    }
}

$statusText = Read-LocalUrl "http://127.0.0.1:8000/api/runtime-status"
if ($statusText) {
    try {
        $status = $statusText | ConvertFrom-Json
        if ($status.apiVersion -eq $ExpectedApiVersion) {
            exit 10
        }
    } catch {}
}

$ownerPid = $null
try {
    $listener = Get-NetTCPConnection -LocalPort 8000 -State Listen | Select-Object -First 1
    if ($listener) {
        $ownerPid = $listener.OwningProcess
    }
} catch {}

if (-not $ownerPid) {
    $line = netstat -ano -p tcp |
        Select-String '^\s*TCP\s+(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]):8000\s+\S+\s+LISTENING\s+(\d+)\s*$' |
        Select-Object -First 1
    if ($line -and $line.Line -match 'LISTENING\s+(\d+)\s*$') {
        $ownerPid = [int]$matches[1]
    }
}

if (-not $ownerPid) {
    exit 0
}

$pageText = Read-LocalUrl "http://127.0.0.1:8000/"
$process = Get-Process -Id $ownerPid
$isDashboard = $pageText -and
    $pageText -match 'id="dailyCloseout"' -and
    $pageText -match 'id="studyProgressRunner"'
$isPython = $process -and $process.ProcessName -match '^python(?:w)?$'

if ($isDashboard -and $isPython) {
    Stop-Process -Id $ownerPid -Force
    Start-Sleep -Milliseconds 700
    exit 0
}

exit 12
