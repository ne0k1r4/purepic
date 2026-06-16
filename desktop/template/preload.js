const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("metastripAPI", {
  pickFiles:   ()      => ipcRenderer.invoke("pick-files"),
  pickFolder:  ()      => ipcRenderer.invoke("pick-folder"),
  readMeta:    (path)  => ipcRenderer.invoke("read-meta", path),
  stripFile:   (opts)  => ipcRenderer.invoke("strip-file", opts),
  openFolder:  (path)  => ipcRenderer.invoke("open-folder", path),
})
