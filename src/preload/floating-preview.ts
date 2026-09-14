import { contextBridge, ipcRenderer } from "electron";

import { floatingPreviewStateSchema } from "../shared/floating-preview";
import {
  FLOATING_PREVIEW_CLOSE_CHANNEL,
  FLOATING_PREVIEW_GET_STATE_CHANNEL,
} from "../shared/protocol/channels";

const floatingPreview = Object.freeze({
  getState: async () =>
    floatingPreviewStateSchema.parse(
      await ipcRenderer.invoke(FLOATING_PREVIEW_GET_STATE_CHANNEL),
    ),
  close: () => ipcRenderer.send(FLOATING_PREVIEW_CLOSE_CHANNEL),
});

contextBridge.exposeInMainWorld("superFloatingPreview", floatingPreview);
