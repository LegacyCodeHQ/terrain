interface ElectronAPI {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, listener: (...args: unknown[]) => void) => () => void;
}

interface Window {
  electronAPI: ElectronAPI;
}
