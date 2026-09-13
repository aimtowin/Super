; Isolated UI preview: no [Files], registry entries, shortcuts or uninstaller.
; Compile with ISCC /DAppVersion=<version> scripts\release\preview-update-ui.iss
; Launch with /SP- /SILENT /SUPERLIB-FOREGROUND-UPDATE
; Add /PREVIEWPROGRESS=1 to inspect the 56% state.
#ifndef AppVersion
  #define AppVersion "2.2.2"
#endif
#define SuperUpdatePreview

[Setup]
AppId=SuperLibUpdaterVisualPreview
AppName=Super Lib Update Preview
AppVersion={#AppVersion}
DefaultDirName={tmp}\super-update-ui-preview
OutputDir=..\..\tmp\update-ui-preview
OutputBaseFilename=SuperUpdatePreview
PrivilegesRequired=lowest
Uninstallable=no
CreateAppDir=no
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
    if ExpandConstant('{param:PREVIEWPROGRESS|0}') = '1' then
    begin
      // Real installers use large counters; exercise overflow-safe math too.
      UpdateSilentUpdateProgress(560000000, 1000000000);
      PreviewProgressPinned := True;
      SilentUpdateFinished := True;
      SilentUpdateClose.Visible := True;
      SilentUpdateForm.Hide;
      SilentUpdateForm.ShowModal;
    end
    else
    begin
      ShowSilentUpdateCompletion();
    end;
  end;
end;
