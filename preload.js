const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
    send: (action, data) => {
        ipcRenderer.send(action, data)
    },
    get: async (action, data) => {
        return await ipcRenderer.invoke(action, data)
    },
    receive: (action, func) => {

        ipcRenderer.on(action, (event, ...args) => func(...args))

    }
})