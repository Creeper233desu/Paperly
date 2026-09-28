# Rebuild the Android nine-patch splash images from the tracked app icon.
# The two stretch regions on each axis keep the book mark centered on tablets.
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot 'static/brand/app-icon-master.png'
$outputDir = Join-Path $projectRoot 'static/splash'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$sizes = @(
    @{ Name = 'hdpi'; Width = 480; Height = 762; Icon = 144 },
    @{ Name = 'xhdpi'; Width = 720; Height = 1242; Icon = 192 },
    @{ Name = 'xxhdpi'; Width = 1080; Height = 1882; Icon = 288 }
)

$source = [System.Drawing.Image]::FromFile($sourcePath)
try {
    foreach ($size in $sizes) {
        $width = [int]$size.Width
        $height = [int]$size.Height
        $bitmap = [System.Drawing.Bitmap]::new($width + 2, $height + 2, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $canvas = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $canvas.Clear([System.Drawing.Color]::Transparent)
                $canvas.FillRectangle([System.Drawing.Brushes]::Black, 1, 1, $width, $height)
                $canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $canvas.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $iconSize = [int]$size.Icon
                $canvas.DrawImage($source, [int](1 + ($width - $iconSize) / 2), [int](1 + ($height - $iconSize) / 2), $iconSize, $iconSize)
            } finally { $canvas.Dispose() }

            # Equal stretch bands on both sides retain the exact icon geometry.
            $black = [System.Drawing.Color]::Black
            foreach ($x in ([int]($width * .14)..[int]($width * .24)) + ([int]($width * .76)..[int]($width * .86))) {
                $bitmap.SetPixel($x, 0, $black)
            }
            foreach ($y in ([int]($height * .15)..[int]($height * .25)) + ([int]($height * .75)..[int]($height * .85))) {
                $bitmap.SetPixel(0, $y, $black)
            }
            for ($x = 1; $x -le $width; $x++) { $bitmap.SetPixel($x, $height + 1, $black) }
            for ($y = 1; $y -le $height; $y++) { $bitmap.SetPixel($width + 1, $y, $black) }
            $bitmap.Save((Join-Path $outputDir "$($size.Name).9.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $bitmap.Dispose() }
    }
} finally { $source.Dispose() }
