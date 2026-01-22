# fix_encoding3.ps1
# Recover files when UTF-8 bytes were misinterpreted as CP1252 (fixes â€¢ etc.)
Param()

$repo = Get-Location
Write-Host "Repository: $repo"

# create backup
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $repo ("nyota-system-backup-" + $ts)
Write-Host "Creating backup at: $backup"
Copy-Item -Path $repo -Destination $backup -Recurse -Force

# encodings
$encUtf8 = [System.Text.Encoding]::UTF8
$enc1252 = [System.Text.Encoding]::GetEncoding(1252)

# collect files
$files = Get-ChildItem -Path $repo -Include *.html,*.css,*.js -Recurse -File

foreach ($f in $files) {
    try {
        $path = $f.FullName
        $bytes = [System.IO.File]::ReadAllBytes($path)

        # decode as UTF8 first
        $asUtf8 = $encUtf8.GetString($bytes)

        # detect suspicious sequences (typical garble bytes U+00E2 / U+00C3 in the decoded text)
        if ($asUtf8 -match '\u00E2|\u00C3') {
            Write-Host "Detected garble candidate in: $path"

            # reinterpret: decode raw bytes as CP1252 then re-decode those bytes as UTF8
            $s1252 = $enc1252.GetString($bytes)
            $bytesRecovered = $enc1252.GetBytes($s1252)
            $recovered = $encUtf8.GetString($bytesRecovered)

            # ensure HTML files have meta charset
            if ($path.ToLower().EndsWith(".html")) {
                if ($recovered -notmatch '(?i)<meta\s+charset\s*=') {
                    if ($recovered -match '(?i)<head[^>]*>') {
                        $recovered = [regex]::Replace($recovered, '(?i)(<head[^>]*>)', '$1' + "`n    <meta charset=`"utf-8`">")
                    } else {
                        $recovered = "<meta charset=`"utf-8`">`n" + $recovered
                    }
                    Write-Host "Inserted <meta charset> into $path"
                }
            }

            # write recovered text as UTF8 (no BOM)
            [System.IO.File]::WriteAllText($path, $recovered, $encUtf8)
            Write-Host "Recovered and wrote UTF-8: $path"
        } else {
            # no garble detected: rewrite file as UTF8 to normalize encoding
            [System.IO.File]::WriteAllText($path, $asUtf8, $encUtf8)
            #Write-Host "Rewrote as UTF-8 (no change): $path"
        }
    } catch {
        Write-Warning "Failed to process $path : $($_.Exception.Message)"
    }
}

# commit & push if repo
if (Test-Path ".git") {
    git add -A
    $porcelain = git status --porcelain
    if (-not [string]::IsNullOrWhiteSpace($porcelain)) {
        git commit -m "fix: recover encoding issues and add meta charset"
        git push origin main
        Write-Host "Committed & pushed changes to origin/main"
    } else {
        Write-Host "No changes to commit"
    }
} else {
    Write-Host "No .git folder; skipping commit/push."
}

Write-Host "Done."
