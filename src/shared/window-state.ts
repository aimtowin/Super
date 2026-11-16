import { z } from "zod";

/** Main-owned preference for restoring the main window placement. */
export const windowStatePreferencesSchema = z.strictObject({
  rememberWindowState: z.boolean(),
});

export type WindowStatePreferences = z.infer<typeof windowStatePreferencesSchema>;

/** Renderer → Main request. Omitted boolean reads the current preferences. */
export const windowStateRequestSchema = z.strictObject({
  rememberWindowState: z.boolean().optional(),
});

export type WindowStateRequest = z.infer<typeof windowStateRequestSchema>;

export interface SuperWindowStateApi {
  getPreferences(): Promise<WindowStatePreferences>;
  setRememberWindowState(rememberWindowState: boolean): Promise<WindowStatePreferences>;
}