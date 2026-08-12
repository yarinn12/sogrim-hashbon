$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $root "docs\store-assets\app-icon-1024.png"
$iosPath = Join-Path $root "ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png"
$tempPath = Join-Path ([System.IO.Path]::GetTempPath()) "sogrim-app-icon-rgb.png"

$source = [System.Drawing.Bitmap]::FromFile($sourcePath)
try {
  $output = New-Object System.Drawing.Bitmap(
    $source.Width,
    $source.Height,
    [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
  )
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($output)
    try {
      $graphics.Clear([System.Drawing.Color]::White)
      $graphics.DrawImageUnscaled($source, 0, 0)
    } finally {
      $graphics.Dispose()
    }
    $output.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $output.Dispose()
  }
} finally {
  $source.Dispose()
}

Move-Item -LiteralPath $tempPath -Destination $sourcePath -Force
Copy-Item -LiteralPath $sourcePath -Destination $iosPath -Force
Write-Output "App Store icon is opaque RGB in both store and iOS assets."
