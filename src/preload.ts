import { contextBridge, ipcRenderer } from 'electron';
import { createDamApi } from './ipc/handlers';

/**
 * Preload bridge: expose a typed damApi on window with contextIsolation.
 * Renderer never gets raw ipcRenderer or Node APIs.
 */
const damApi = createDamApi((channel, ...args) =>
  ipcRenderer.invoke(channel, ...args)
);

contextBridge.exposeInMainWorld('damApi', damApi);
