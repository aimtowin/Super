; Super Windows 安装器（Inno Setup，参考 VS Code build/win32/code.iss）。
; 多语言：ShowLanguageDialog=yes 始终显示语言选择（默认选中系统语言，
; 见 [Languages] 顺序与 Inno 检测逻辑）；向导含安装路径选择页；per-machine
; 安装（UAC 一开始提示）；卸载器 unins000.exe 自动生成。
; 构建：ISCC.exe assets\inno\supersetup.iss（SourceDir 指向打包产物父目录）

#define AppName "Super Lib"
; 版本由 inno-build.mjs 从 package.json 以 -DAppVersion 传入（npm version 提升后
; 安装器版本自动跟随）；缺省 0.0.1 仅为直接手工编译 ISCC 时的兜底。
#ifndef AppVersion
  #define AppVersion "0.0.1"
#endif
#define AppExeName "Super.exe"

[Setup]
AppId={{F3A7C2E1-9B5D-4E8A-8C3F-1D6B2A9E4C71}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Super Lib
; autopf：按 PrivilegesRequired 自动选择（admin → Program Files）
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
OutputDir=..\..\out\make\inno
OutputBaseFilename=SuperSetup
Compression=lzma
SolidCompression=yes
SetupIconFile=..\..\assets\icons\app.ico
UninstallDisplayIcon={app}\{#AppExeName}
MinVersion=10.0
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; 语言选择：yes = 安装启动时始终显示语言选择对话框（默认选中系统语言）
ShowLanguageDialog=yes
WizardStyle=modern
DisableWelcomePage=yes
DisableReadyPage=yes
; per-machine：安装到 Program Files，UAC 提权（产品要求"一开始提示"）
PrivilegesRequired=admin
CloseApplications=force

[Languages]
; 英文在前 → 系统语言不匹配时默认英文
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\..\out\Super-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; 2.1.0 起应用改为 resources\app 文件树，以便后续更新能按文件做增量传输。
; Electron 会优先载入 app.asar，因此从旧版升级时必须清除遗留归档；否则新
; 文件虽然复制成功，实际运行的仍会是旧版 app.asar。
[InstallDelete]
Type: files; Name: "{app}\resources\app.asar"
Type: filesandordirs; Name: "{app}\resources\app.asar.unpacked"

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Code]
#include "silent-update-ui.iss"

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
    ShowSilentUpdateProgress();
  if CurStep = ssPostInstall then
  begin
    SaveStringToFile(ExpandConstant('{app}\.super-installed'), 'installed', False);
    ShowSilentUpdateCompletion();
  end;
end;

procedure CurInstallProgressChanged(CurProgress, MaxProgress: Integer);
begin
  UpdateSilentUpdateProgress(CurProgress, MaxProgress);
end;

procedure CurUninstallStepChanged(UninstallStep: TUninstallStep);
begin
  if UninstallStep = usUninstall then
    DeleteFile(ExpandConstant('{app}\.super-installed'));
end;

[Run]
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
