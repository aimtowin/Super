import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const ui = read('assets/inno/silent-update-ui.iss');
const procedure = (name: string) => {
  const start = ui.indexOf(`procedure ${name}(`);
  const next = ui.indexOf('\nprocedure ', start + 1);
  return ui.slice(start, next < 0 ? undefined : next);
};

describe('shared native updater lifecycle contracts', () => {
  it('shows completion and schedules automatic opening without a required launch button', () => {
    const completion = procedure('ShowSilentUpdateCompletion');
    expect(completion).toContain('正在打开 Super Lib');
    expect(completion).toContain('SilentUpdateLaunchSurface.Visible := False');
    expect(completion).toContain('CreateCallback(@AutoLaunchUpdatedApp)');
    expect(completion).toContain('SilentUpdateForm.ShowModal');
  });

  it('disarms automatic opening before launch and keeps retry only on failure', () => {
    const launch = procedure('SilentUpdateLaunchClick');
    expect(launch.indexOf('StopAutoLaunchTimer()')).toBeGreaterThan(0);
    expect(launch.indexOf('StopAutoLaunchTimer()')).toBeLessThan(launch.indexOf('ExecAsOriginalUser('));
    expect(launch).toContain('SilentUpdateLaunchInProgress');
    expect(launch).toContain('ShowSilentUpdateLaunchFailure(ResultCode)');
    expect(launch).toContain("'--updated'");
    expect(procedure('AutoLaunchUpdatedApp')).toContain('Arg3 <> SilentUpdateAutoLaunchTimer');
    expect(procedure('ShowSilentUpdateLaunchFailure')).toContain('SilentUpdateLaunchSurface.Enabled := True');
    expect(procedure('ShowSilentUpdateLaunchFailure')).toContain('SilentUpdateClose.Visible := True');
  });

  it('cleans both timers on exit and prevents dismissal during installation/automatic opening', () => {
    expect(procedure('DeinitializeSetup')).toContain('StopAutoLaunchTimer()');
    expect(procedure('DeinitializeSetup')).toContain('KillTimer(0, ForegroundAdvanceTimer)');
    expect(procedure('SilentUpdateCloseQuery')).toContain('(SilentUpdateAutoLaunchTimer = 0)');
    expect(procedure('SilentUpdateCloseQuery')).toContain('not SilentUpdateLaunchInProgress');
  });

  it('shares behavior across full and delta installers and isolates preview launch simulation', () => {
    expect(read('assets/inno/supersetup.iss')).toContain('#include "silent-update-ui.iss"');
    expect(read('scripts/release/build-inno-delta.mjs')).toContain('#include "${escaped(silentUpdateUiPath)}"');
    expect(ui).toMatch(/#ifdef SuperUpdatePreview[\s\S]*preview launch attempt[\s\S]*#else[\s\S]*ExecAsOriginalUser/);
  });
});
