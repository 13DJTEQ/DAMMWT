import { contextBridge, ipcRenderer } from 'electron';
import {
  createDamApi,
  MEDIA_UPDATED_CHANNEL,
} from './ipc/handlers';

/**
 * Preload bridge: expose a typed damApi on window with contextIsolation.
 * Renderer never gets raw ipcRenderer or Node APIs.
 */
const damApi = createDamApi((channel, ...args) =>
  ipcRenderer.invoke(channel, ...args)
);

/** Subscribe to main-process media ingest notifications (fs.watch / Refresh). */
function onMediaUpdated(callback: () => void): () => void {
  const handler = (): void => {
    callback();
  };
  ipcRenderer.on(MEDIA_UPDATED_CHANNEL, handler);
  return () => {
    ipcRenderer.removeListener(MEDIA_UPDATED_CHANNEL, handler);
  };
}

contextBridge.exposeInMainWorld('damApi', {
  ...damApi,
  onMediaUpdated,
});
