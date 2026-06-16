// main.js — electron entry for metastrip GUI
// TODO: add drag and drop support directly onto the window
// TODO: add batch progress bar for large folders
// TODO: remember last used output mode between sessions

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron")
const path    = require("path")
const fs      = require("fs-extra")
const { stripFile, readMeta } = require("../src/stripper")

const SUPPORTED = [".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif"]

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 780,
    height: 620,
    minWidth: 600,
    minHeight: 500,
    title: "metastrip",
    backgroundColor: "#0f0f13",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    }
  })

  win.loadFile(path.join(__dirname, "index.html"))
  win.once("ready-to-show", () => win.show())
  win.on("closed", () => { win = null })
}

app.whenReady().then(createWindow)
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit() })
app.on("activate", () => { if (!win) createWindow() })

// open file picker
ipcMain.handle("pick-files", async () => {
  const result = await dialog.showOpenDialog(win, {
    title: "Select files to strip",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "tiff", "tif"] },
      { name: "All Files", extensions: ["*"] }
    ]
  })
  return result.canceled ? [] : result.filePaths
})

// open folder picker
ipcMain.handle("pick-folder", async () => {
  const result = await dialog.showOpenDialog(win, {
    title: "Select folder to strip",
    properties: ["openDirectory"]
  })
  return result.canceled ? null : result.filePaths[0]
})

// read metadata from a file
ipcMain.handle("read-meta", async (_, filePath) => {
  return readMeta(filePath).catch(() => null)
})

// strip a single file
ipcMain.handle("strip-file", async (_, { input, output, keepDimensions }) => {
  try {
    await stripFile(input, output, { keepDimensions })
    const inSize  = fs.statSync(input).size
    const outSize = fs.statSync(output).size
    return { ok: true, saved: inSize - outSize }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// open output folder in file manager
ipcMain.handle("open-folder", async (_, folderPath) => {
  shell.openPath(folderPath).catch(() => {})
})
