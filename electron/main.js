const { app, BrowserWindow, shell } = require('electron')
const { url } = require('./config.json')

function open() {
  const win = new BrowserWindow({ width: 1100, height: 800, autoHideMenuBar: true })
  win.loadURL(url)
  // Links in notes open in the browser, not in this window.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target)
    return { action: 'deny' }
  })
}

app.whenReady().then(open)
app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && open())
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
