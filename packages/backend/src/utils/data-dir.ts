import { join } from 'node:path';
import { homedir } from 'node:os';

export function getDataDir(): string {
  const platform = process.platform;

  if (platform === 'win32') {
    const appData = process.env.APPDATA;
    if (appData) {
      return join(appData, 'Vantage');
    }
    return join(homedir(), 'AppData', 'Roaming', 'Vantage');
  }

  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'vantage');
  }

  // Linux and others
  const xdgData = process.env.XDG_DATA_HOME;
  if (xdgData) {
    return join(xdgData, 'vantage');
  }
  return join(homedir(), '.local', 'share', 'vantage');
}
