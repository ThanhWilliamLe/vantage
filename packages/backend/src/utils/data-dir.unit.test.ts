import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getDataDir } from './data-dir.js';

describe('getDataDir', () => {
  it('returns a platform-appropriate path containing "vantage"', () => {
    const dataDir = getDataDir();
    expect(dataDir.toLowerCase()).toContain('vantage');
  });

  it('returns an absolute path', () => {
    const dataDir = getDataDir();
    // On all platforms, absolute paths start with / or a drive letter
    const isAbsolute = dataDir.startsWith('/') || /^[A-Z]:\\/i.test(dataDir);
    expect(isAbsolute).toBe(true);
  });

  it('returns correct path for current platform', () => {
    const dataDir = getDataDir();
    const platform = process.platform;

    if (platform === 'win32') {
      // Should be in APPDATA or fallback
      const appData = process.env.APPDATA;
      if (appData) {
        expect(dataDir).toBe(join(appData, 'Vantage'));
      } else {
        expect(dataDir).toBe(join(homedir(), 'AppData', 'Roaming', 'Vantage'));
      }
    } else if (platform === 'darwin') {
      expect(dataDir).toBe(join(homedir(), 'Library', 'Application Support', 'vantage'));
    } else {
      // Linux
      const xdgData = process.env.XDG_DATA_HOME;
      if (xdgData) {
        expect(dataDir).toBe(join(xdgData, 'vantage'));
      } else {
        expect(dataDir).toBe(join(homedir(), '.local', 'share', 'vantage'));
      }
    }
  });
});
