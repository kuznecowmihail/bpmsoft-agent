// Renders build/background.svg to build/background.png (540×380) and build/background@2x.png (1080×760)
// with Electron's own Chromium. On macOS also packs both sizes into build/background.tiff via tiffutil (DMG background).
// White page background (not transparent): used as the DMG window background.
// Run: npx electron build/render-background.cjs   (from apps/desktop)
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const WIDTH = 540
const HEIGHT = 380
const svgPath = path.join(__dirname, 'background.svg')
const targets = [
  { scale: 1, pngPath: path.join(__dirname, 'background.png') },
  { scale: 2, pngPath: path.join(__dirname, 'background@2x.png') }
]

async function render(win, svgSource, scale) {
  const w = WIDTH * scale
  const h = HEIGHT * scale
  // Scale the SVG by setting its own size attributes; the viewBox keeps the drawing proportional.
  const svg = svgSource.replace('width="540" height="380"', 'width="' + w + '" height="' + h + '"')
  win.setContentSize(w, h)
  const html =
    '<html><body style="margin:0;background:#ffffff;overflow:hidden">' +
    '<div style="display:block;width:' + w + 'px;height:' + h + 'px">' + svg + '</div></body></html>'
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((resolve) => setTimeout(resolve, 500))
  let image = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h })
  if (image.getSize().width !== w || image.getSize().height !== h) {
    image = image.resize({ width: w, height: h, quality: 'best' })
  }
  return image
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const svgSource = fs.readFileSync(svgPath, 'utf8')
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    transparent: false,
    backgroundColor: '#ffffff',
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true }
  })
  for (const target of targets) {
    const image = await render(win, svgSource, target.scale)
    fs.writeFileSync(target.pngPath, image.toPNG())
    console.log('written', target.pngPath, image.getSize())
  }
  if (process.platform === 'darwin') {
    execFileSync('tiffutil', ['-cathidpicheck', targets[0].pngPath, targets[1].pngPath, '-out', path.join(__dirname, 'background.tiff')])
    console.log('written', path.join(__dirname, 'background.tiff'))
  }
  app.quit()
})
