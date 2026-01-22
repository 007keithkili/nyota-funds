# fix_encoding2.ps1 - safe recovery for UTF-8 vs CP1252 garble
Param()

$repo = Get-Location
Write-Host "Repository: $repo"

# backup
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $repo ("nyota-system-backup-" + $ts)
Write-Host "Creating backup at: $backup"
Copy-Item -Path $repo -Destination $backup -Recurse -Force

# helpers
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

        # detect common garble sequences by codepoints: U+00E2 (â) or U+00C3 (Ã)
        if ($asUtf8 -match '\u00E2|\u00C3') {
            Write-Host "Detected garble candidate in: $path"

            # reinterpret bytes: decode bytes as CP1252 -> get the string that currently looks garbled,
            # then get bytes of that string in CP1252 (these bytes should be original UTF8 bytes),
            # then decode those bytes as UTF8 to recover original text.
            $s1252 = $enc1252.GetString($bytes)
            $bytesRecovered = $enc1252.GetBytes($s1252)
            $recovered = $encUtf8.GetString($bytesRecovered)

            # ensure HTML files contain meta charset
            if ($path.ToLower().EndsWith(".html")) {
                if ($recovered -notmatch '(?i)<meta\s+charset\s*=') {
                    # insert meta after <head> tag if present, otherwise prepend
                    if ($recovered -match '(?i)<head[^>]*>') {
                        $recovered = [regex]::Replace($recovered, '(?i)(<head[^>]*>)', '$1' + "`n    <meta charset=`"utf-8`">")
                    } else {
                        $recovered = "<meta charset=`"utf-8`">`n" + $recovered
                    }
                    Write-Host "Inserted <meta charset> into $path"
                }
            }

            # write back as UTF8 without BOM
            [System.IO.File]::WriteAllText($path, $recovered, New-Object System.Text.UTF8Encoding($false))
            Write-Host "Recovered and wrote UTF-8: $path"
        } else {
            # no garble detected; ensure file is saved as UTF8 (re-write)
            $text = $asUtf8
            [System.IO.File]::WriteAllText($path, $text, New-Object System.Text.UTF8Encoding($false))
            #Write-Host "Rewrote as UTF-8 (no changes): $path"
        }
    } catch {
        Write-Warning "Failed to process $path : $($_.Exception.Message)"
    }
}

# commit & push if a git repo exists
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
