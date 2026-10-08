import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { compileFunction } from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

import * as updates from '../../src/main/app-update-service';

type InstallerProcess = EventEmitter & { unref(): void };
type LauncherPorts = {
  platform: string;
  spawnChild(file: string, args: string[], options: { detached: true; stdio: 'ignore'; windowsHide: false }): InstallerProcess;
  openPath(file: string): Promise<string>;
};
type Launcher = (file: string, mode: 'interactive' | 'silent') => Promise<void>;

async function actualMainLauncher(ports: LauncherPorts): Promise<Launcher> {
  const source = await readFile(new URL('../../src/main/index.ts', import.meta.url), 'utf8');
  const exports = updates as typeof updates & {
    createAppUpdateInstallerLauncher?: (ports: LauncherPorts) => Launcher;
  };
  if (exports.createAppUpdateInstallerLauncher) {
    // Test the production launcher with a separate Main-wiring assertion, not
    // a parallel test state machine and not a claim of complete Main E2E.
    expect(source).toMatch(/launchInstaller: createAppUpdateInstallerLauncher\(\{\s*platform: process\.platform,\s*openPath:/u);
    return exports.createAppUpdateInstallerLauncher(ports);
  }
  // Red executes the exact existing Main launcher body with an EventEmitter
  // child; no Electron application, installer or process is actually started.
  const marker = '    launchInstaller: async (installerPath, mode) => {';
  const start = source.indexOf(marker);
  const end = source.indexOf('\n    },\n    onDownloadProgress:', start);
  if (start < 0 || end < 0) throw new Error('The actual Main update launcher was not located.');
  const body = source.slice(start + marker.length, end);
  const execute = compileFunction(`return (async () => {\n${body}\n})()`,
    ['installerPath', 'mode', 'process', 'spawn', 'shell']);
  return (file, mode) => execute(file, mode, { platform: ports.platform }, ports.spawnChild, { openPath: ports.openPath });
}

function processFixture(platform = 'win32') {
  const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
  const spawnChild = vi.fn(() => child);
  const openPath = vi.fn<LauncherPorts['openPath']>().mockResolvedValue('');
  return { child, spawnChild, openPath, ports: { platform, spawnChild, openPath } };
}

describe('actual Main installer-launch handoff', () => {
  it('does not resolve or unref until Windows confirms the spawn, preserving the foreground silent flags', async () => {
    const fixture = processFixture();
    const launcher = await actualMainLauncher(fixture.ports);
    let settled = false;
    const launch = launcher('SuperSetup.exe', 'silent').then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(fixture.child.unref).not.toHaveBeenCalled();
    expect(fixture.spawnChild).toHaveBeenCalledWith('SuperSetup.exe',
      ['/SP-', '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS'],
      { detached: true, stdio: 'ignore', windowsHide: false });
    fixture.child.emit('spawn');
    await launch;
    expect(fixture.child.unref).toHaveBeenCalledTimes(1);
    expect(settled).toBe(true);
    expect(fixture.child.listenerCount('error')).toBe(0);
    expect(fixture.child.listenerCount('spawn')).toBe(0);
  });

  it('rejects an asynchronous Windows spawn error instead of reporting opened/triggering an unhandled event', async () => {
    const fixture = processFixture();
    const launcher = await actualMainLauncher(fixture.ports);
    const launch = launcher('SuperSetup.exe', 'silent');
    const rejected = expect(launch).rejects.toThrow('fixture EACCES');
    // Avoid creating an unrelated uncaught EventEmitter error on the old
    // implementation. The red signal is its real already-resolved Promise.
    if (fixture.child.listenerCount('error') > 0) fixture.child.emit('error', new Error('fixture EACCES'));
    await rejected;
    expect(fixture.child.unref).not.toHaveBeenCalled();
    expect(fixture.child.listenerCount('error')).toBe(0);
    expect(fixture.child.listenerCount('spawn')).toBe(0);
  });

  it('rejects a synchronous spawn dispatch throw without shell fallback or an automatic retry', async () => {
    const fixture = processFixture();
    fixture.spawnChild.mockImplementation(() => { throw new Error('fixture spawn dispatch failed'); });
    const launcher = await actualMainLauncher(fixture.ports);
    await expect(launcher('SuperSetup.exe', 'silent')).rejects.toThrow('fixture spawn dispatch failed');
    expect(fixture.spawnChild).toHaveBeenCalledTimes(1);
    expect(fixture.openPath).not.toHaveBeenCalled();
  });

  it('retains interactive arguments and never spawns on the macOS open-path branch', async () => {
    const windows = processFixture();
    const windowsLauncher = await actualMainLauncher(windows.ports);
    const launched = windowsLauncher('SuperSetup.exe', 'interactive');
    windows.child.emit('spawn');
    await launched;
    expect(windows.spawnChild.mock.calls[0]).toEqual(['SuperSetup.exe', [], { detached: true, stdio: 'ignore', windowsHide: false }]);
    const mac = processFixture('darwin');
    const macLauncher = await actualMainLauncher(mac.ports);
    await expect(macLauncher('Super.dmg', 'interactive')).resolves.toBeUndefined();
    expect(mac.openPath).toHaveBeenCalledWith('Super.dmg');
    expect(mac.spawnChild).not.toHaveBeenCalled();
    mac.openPath.mockResolvedValue('fixture shell-open failed');
    await expect(macLauncher('Super.dmg', 'interactive')).rejects.toThrow('fixture shell-open failed');
  });
});
