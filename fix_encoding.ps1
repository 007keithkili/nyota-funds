# fix_encoding.ps1 - fix garbled bullets & enforce UTF-8 + meta charset
try {
  $repo = Get-Location
  Write-Host "Repository: $repo"

  # 0) backup whole folder
  $ts = (Get-Date).ToString("yyyyMMdd-HHmmss")
  $backup = Join-Path $repo ("nyota-system-backup-" + $ts)
  Write-Host "Creating backup: $backup"
  Copy-Item -Path $repo -Destination $backup -Recurse -Force

  # 1) ensure meta charset in HTML files
  Get-ChildItem -Path $repo -Filter *.html -Recurse -File | ForEach-Object {
    $path = $_.FullName
    $content = Get-Content -LiteralPath $path -Raw -ErrorAction Stop
    if ($content -notmatch '(?i)<meta\s+charset\s*=') {
      # insert meta right after <head> tag
      $content = $content -replace '(?i)(<head[^>]*>)', "`$1`n    <meta charset=`"utf-8`">"
      # write back as UTF8 (no BOM)
      [System.IO.File]::WriteAllText($path, $content, New-Object System.Text.UTF8Encoding($false))
      Write-Host "Added meta charset=utf-8 to $path"
    } else {
      Write-Host "meta charset present in $path"
    }
  }

  # 2) Find & replace common garbled sequences
  $replacements = @{
    'â€¢'      = '•';     # common bullet garble
    'Ã¢Â€Â¢'   = '•';     # another variant
    'â€™'      = '’';     # right single quote
    'â€œ'      = '“';     # left double quote
    'â€\u009d' = '”';     # right double quote variant
    'Ã©'      = 'é'      # example accented e variant (add more if needed)
  }

  $files = Get-ChildItem -Path $repo -Include *.html,*.css,*.js -Recurse -File
  foreach ($f in $files) {
    $text = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction SilentlyContinue
    if ($null -eq $text) { continue }
    $new = $text
    foreach ($k in $replacements.Keys) {
      $new = $new -replace [regex]::Escape($k), $replacements[$k]
    }
    # also fix CSS content property for garbled bullet
    $new = $new -replace 'content\s*:\s*["'']\s*(?:â€¢|Ã¢Â€Â¢)\s*["'']', 'content: "\2022"'

    if ($new -ne $text) {
      [System.IO.File]::WriteAllText($f.FullName, $new, New-Object System.Text.UTF8Encoding($false))
      Write-Host "Repaired encoding in $($f.FullName)"
    }
  }

  # 3) Normalize encodings (rewrite as UTF8 no BOM)
  foreach ($f in $files) {
    $d = Get-Content -LiteralPath $f.FullName -Raw
    [System.IO.File]::WriteAllText($f.FullName, $d, New-Object System.Text.UTF8Encoding($false))
  }
  Write-Host "Normalized file encodings to UTF-8 (no BOM)."

  # 4) git add/commit/push if repo present
  if (Test-Path ".git") {
    git add -A
    $porcelain = git status --porcelain
    if (-not [string]::IsNullOrWhiteSpace($porcelain)) {
      git commit -m "fix: encoding + add meta charset; replace garbled bullets"
      git push origin main
      Write-Host "Committed & pushed changes."
    } else {
      Write-Host "No changes to commit."
    }
  } else {
    Write-Host "No .git folder found; skipping git commit/push."
  }

  Write-Host "Done."
} catch {
  Write-Error "Error: $($_.Exception.Message)"
  throw
}
