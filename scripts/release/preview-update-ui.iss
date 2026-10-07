; Isolated UI preview: no [Files], registry entries, shortcuts or uninstaller.
; Compile with ISCC /DAppVersion=<version> scripts\release\preview-update-ui.iss
; Launch with /SP- /SILENT /SUPERLIB-FOREGROUND-UPDATE
; Add /PREVIEWPROGRESS=1 to inspect the 56% state.
; /PREVIEWCOMPLETIONHOLD=1 holds completion for screenshots only.
; /PREVIEWLAUNCHFAIL=1 fails the first simulated launch, then allows retry.
#ifndef AppVersion
  #define AppVersion "2.2.2"
#endif
#ifndef SuperUpdateCompileOnly
  #define SuperUpdatePreview
#endif

[Setup]
AppId=SuperLibUpdaterVisualPreview
AppName=Super Lib Update Preview
AppVersion={#AppVersion}
DefaultDirName={tmp}\super-update-ui-preview
OutputDir=..\..\tmp\update-ui-preview
#ifdef SuperUpdateCompileOnly
OutputBaseFilename=SuperUpdateCompileOnly
#else
OutputBaseFilename=SuperUpdatePreview
#endif
PrivilegesRequired=lowest
Uninstallable=no
#ifdef SuperUpdateCompileOnly
; The real launch smoke test supplies /DIR pointing only at its isolated probe.
CreateAppDir=yes
#else
CreateAppDir=no
#endif
CreateUninstallRegKey=no
DisableDirPage=yes
DisableWelcomePage=yes
DisableReadyPage=yes
CloseApplications=no

[Code]
#include "..\..\assets\inno\silent-update-ui.iss"

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then ShowSilentUpdateProgress();
  if CurStep = ssPostInstall then
  begin
#ifdef SuperUpdatePreview
    if ExpandConstant('{param:PREVIEWPROGRESS|0}') = '1' then
    begin
      // Real installers use large counters; exercise overflow-safe math too.
      UpdateSilentUpdateProgress(560000000, 1000000000);
      PreviewProgressPinned := True;
      SilentUpdateForm.Hide;
      SilentUpdateForm.ShowModal;
    end
    else
#endif
    begin
      ShowSilentUpdateCompletion();
    end;
  end;
end;
