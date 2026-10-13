// Renders build/icon.svg to build/icon.png (1024×1024, transparent) with Electron's own Chromium.
// Run: npx electron build/render-icon.cjs   (from apps/desktop)
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const SIZE = 1024
const svgPath = path.join(__dirname, 'icon.svg')
const pngPath = path.join(__dirname, 'icon.png')

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true }
  })
  const svg = fs.readFileSync(svgPath, 'utf8')
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((resolve) => setTimeout(resolve, 500))
  let image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })
  if (image.getSize().width !== SIZE) {
    image = image.resize({ width: SIZE, height: SIZE, quality: 'best' })
  }
  fs.writeFileSync(pngPath, image.toPNG())
  console.log('written', pngPath, image.getSize())
  app.quit()
})
