import { BrowserWindow, dialog, ipcMain } from 'electron';
import { DIALOG_IPC } from '@/shared/ipc/dialog-ipc';

export function registerDialogHandlers(): void {
  ipcMain.handle(
    DIALOG_IPC.OPEN_DIRECTORY,
    async (event): Promise<string | null> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.OpenDialogOptions = {
        properties: ['openDirectory'],
      };
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    },
  );

  ipcMain.handle(
    DIALOG_IPC.SHOW_ERROR,
    async (
      event,
      { title, message }: { title: string; message: string },
    ): Promise<void> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const options = {
        type: 'error' as const,
        title,
        message,
        buttons: ['OK'],
      };
      if (win) {
        await dialog.showMessageBox(win, options);
      } else {
        await dialog.showMessageBox(options);
      }
    },
  );
}
