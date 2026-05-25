/**
 * Run this script to generate icon.ico from a PNG file.
 * Usage: node generate-icon.js mylogo.png
 * 
 * Requires: npm install -g sharp
 * Or use online tool: https://icoconvert.com
 */

const fs   = require('fs')
const path = require('path')

const src = process.argv[2]
if (!src) {
  console.log('Usage: node generate-icon.js <source.png>')
  console.log('\nAlternatively, go to https://icoconvert.com and upload your logo PNG.')
  console.log('Download the .ico and save it as: build-resources/icon.ico')
  process.exit(1)
}

try {
  const sharp = require('sharp')
  const sizes = [16, 32, 48, 64, 128, 256]
  console.log(`Generating icon.ico from ${src}...`)

  Promise.all(
    sizes.map(s =>
      sharp(src).resize(s, s).png().toBuffer()
    )
  ).then(buffers => {
    // Write a simple multi-size PNG set (use a real ICO builder for production)
    // For now, write the 256px version and rename to .ico
    // electron-builder accepts large PNGs named .ico on some systems
    fs.writeFileSync(path.join(__dirname, 'icon.ico'), buffers[buffers.length - 1])
    console.log('✅ icon.ico created (256x256). For best results, use https://icoconvert.com')
  })
} catch {
  console.log('\n📌 sharp not installed. Please use one of these methods:')
  console.log('   1. Online: https://icoconvert.com — upload PNG, download .ico')
  console.log('   2. ImageMagick: magick convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico')
  console.log('   3. npm install -g sharp, then rerun this script')
}
