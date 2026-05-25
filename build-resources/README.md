# Build Resources

Place the following files here before building:

## icon.ico (REQUIRED for Windows .exe)
- Size: 256x256 minimum (ideally multi-size .ico: 16, 32, 48, 64, 128, 256px)
- Tool to convert PNG → ICO: https://icoconvert.com or use ImageMagick:
  `magick convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico`

## icon.png (optional, for Linux/Mac builds)
- 512x512 PNG

## license.txt (already included)
- Shown in the Windows installer

## How to build the .exe:
```bash
# 1. Make sure icon.ico is in this folder
# 2. Run:
npm run build:win

# Output will be in dist-electron/
# The installer will be: dist-electron/SchoolFees Manager Setup 1.0.0.exe
```
