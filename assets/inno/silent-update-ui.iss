// Foreground updater for installations started with /SILENT or /VERYSILENT.
// It deliberately lives in Inno rather than Super: the application can exit
// before files are replaced, while this window remains responsible for the
// completion notification and automatic, original-user launch.

var
  SilentUpdateForm: TSetupForm;
  SilentUpdateCard: TPanel;
  SilentUpdateBrand: TNewStaticText;
  SilentUpdateVersion: TNewStaticText;
  SilentUpdateTitle: TNewStaticText;
  SilentUpdateStatus: TNewStaticText;
  SilentUpdateProgressText: TNewStaticText;
  SilentUpdatePercent: TNewStaticText;
  SilentUpdateFooter: TNewStaticText;
  SilentUpdateDivider: TPanel;
  SilentUpdateProgress: TPanel;
  SilentUpdateProgressFill: TPanel;
  SilentUpdateProgressUnknown: Boolean;
  SilentUpdateProgressTick: Integer;
  SilentUpdateLaunchSurface: TBitmapButton;
  SilentUpdateClose: TBitmapButton;
  SilentUpdateButtonState: Integer;
  SilentUpdateFinished: Boolean;
  SilentUpdateLaunchInProgress: Boolean;
  SilentUpdateAutoLaunchTimer: UINT_PTR;
  ForegroundAdvanceTimer: UINT_PTR;
#ifdef SuperUpdatePreview
  PreviewProgressPinned: Boolean;
  PreviewLaunchAttempts: Integer;
#endif

function IsForegroundUpdate(): Boolean;
var
  Index: Integer;
begin
  Result := False;
  for Index := 1 to ParamCount do
  begin
    if Uppercase(ParamStr(Index)) = '/SUPERLIB-FOREGROUND-UPDATE' then
    begin
      Result := True;
      Exit;
    end;
  end;
end;

function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
  RelayInstallerPath: String;
  RelayParameters: String;
begin
  Result := True;
  // Inno's /VERYSILENT mode does not run a usable custom-form message loop.
  // Older Super versions launched update installers that way, so hand the
  // installer off to a fresh foreground instance before installation starts.
  if WizardSilent and not IsForegroundUpdate() then
  begin
    // Older Super builds can remove their downloaded installer immediately
    // after launching it. First copy this executable outside that cache, then
    // wait for the silent instance to exit before starting the foreground copy.
    // The relay filename is fixed, so it never accumulates across updates.
    // {tmp} belongs to Inno itself and disappears when the first process
    // exits. Keep the one-file relay in the user's stable Temp directory.
    RelayInstallerPath := ExpandConstant('{localappdata}\Temp\SuperLib-update-relay.exe');
    RelayParameters := '/C copy /Y "' + ExpandConstant('{srcexe}') + '" "' +
      RelayInstallerPath + '" >nul & ping 127.0.0.1 -n 2 >nul & start "" "' +
      // /SILENT advances the installer without its standard wizard. The
      // foreground flag keeps this process from relaying again, while our
      // custom Super Lib page remains the only visible update interface.
      RelayInstallerPath + '" /SP- /SILENT /SUPERLIB-FOREGROUND-UPDATE';
    Exec(
      ExpandConstant('{cmd}'),
      RelayParameters,
      '',
      SW_HIDE,
      ewNoWait,
      ResultCode
    );
    Result := False;
  end;
end;

function ShowWindow(hWnd: HWND; nCmdShow: Integer): Boolean;
  external 'ShowWindow@user32.dll stdcall';

function SetForegroundWindow(hWnd: HWND): Boolean;
  external 'SetForegroundWindow@user32.dll stdcall';

function SetTimer(hWnd: HWND; nIDEvent: UINT_PTR; uElapse: UINT; lpTimerFunc: NativeInt): UINT_PTR;
  external 'SetTimer@user32.dll stdcall';

function KillTimer(hWnd: HWND; nIDEvent: UINT_PTR): Boolean;
  external 'KillTimer@user32.dll stdcall';

function UpdateGetCursorPos(var Point: TPoint): Boolean;
  external 'GetCursorPos@user32.dll stdcall';

function UpdateScreenToClient(hWnd: HWND; var Point: TPoint): Boolean;
  external 'ScreenToClient@user32.dll stdcall';

function UpdateGetKeyState(Key: Integer): Smallint;
  external 'GetKeyState@user32.dll stdcall';

function UpdateDwmAttribute(hWnd: HWND; Attribute: DWORD; var Value: Integer; Size: DWORD): Integer;
  external 'DwmSetWindowAttribute@dwmapi.dll stdcall delayload';

function UpdateGetWindowLong(hWnd: HWND; Index: Integer): Longint;
  external 'GetWindowLongW@user32.dll stdcall';

function UpdateSetWindowLong(hWnd: HWND; Index, Value: Longint): Longint;
  external 'SetWindowLongW@user32.dll stdcall';

function UpdateSetLayeredAttributes(hWnd: HWND; Color: DWORD; Alpha: Byte; Flags: DWORD): Boolean;
  external 'SetLayeredWindowAttributes@user32.dll stdcall';

const
  BM_CLICK = $00F5;
  UpdateSurface = $002B2622;
  UpdateText = $00F5F2F0;
  UpdateMuted = $00C6BBB3;
  UpdateBlue = $00E47635;

function UpdateRect(Left, Top, Right, Bottom: Integer): TRect;
begin
  Result.Left := Left;
  Result.Top := Top;
  Result.Right := Right;
  Result.Bottom := Bottom;
end;

procedure PaintUpdateButton();
var
  State: Integer;
  Point: TPoint;
  Fill: TColor;
  Bitmap: TBitmap;
  Text: String;
begin
  if not Assigned(SilentUpdateLaunchSurface) then Exit;
  // This bitmap button supplies its own focus treatment through its fill.
  // Hide only its native dotted focus rectangle; keep keyboard focus/TabStop
  // intact and leave other controls' focus indicators unchanged.
  SendMessage(SilentUpdateLaunchSurface.Handle, $0128, $00010001, 0);
  State := 0;
  if SilentUpdateLaunchSurface.Enabled then
  begin
    State := 1;
    if SilentUpdateLaunchSurface.Focused then State := 2;
    if UpdateGetCursorPos(Point) and UpdateScreenToClient(SilentUpdateLaunchSurface.Handle, Point) then
      if (Point.X >= 0) and (Point.Y >= 0) and
         (Point.X < SilentUpdateLaunchSurface.Width) and (Point.Y < SilentUpdateLaunchSurface.Height) then
      begin
        State := 2;
        if UpdateGetKeyState(1) < 0 then State := 3;
      end;
  end;
  if State = SilentUpdateButtonState then Exit;
  SilentUpdateButtonState := State;
  Fill := $004B4137;
  if State = 1 then Fill := $00C56428;
  if State = 2 then Fill := $00CB692E;
  if State = 3 then Fill := $00BF5F2B;
  Bitmap := SilentUpdateLaunchSurface.Bitmap;
  Bitmap.Width := SilentUpdateLaunchSurface.Width;
  Bitmap.Height := SilentUpdateLaunchSurface.Height;
  Bitmap.Canvas.Brush.Color := UpdateSurface;
  Bitmap.Canvas.FillRect(UpdateRect(0, 0, Bitmap.Width, Bitmap.Height));
  Bitmap.Canvas.Pen.Color := Fill;
  Bitmap.Canvas.Brush.Color := Fill;
  Bitmap.Canvas.RoundRect(0, 0, Bitmap.Width, Bitmap.Height, ScaleX(12), ScaleY(12));
  Bitmap.Canvas.Brush.Style := bsClear;
  Bitmap.Canvas.Font.Name := 'Microsoft YaHei UI';
  Bitmap.Canvas.Font.Size := 10;
  Bitmap.Canvas.Font.Style := [fsBold];
  Bitmap.Canvas.Font.Color := UpdateText;
  Text := '重试打开';
  if State = 0 then
  begin
    Text := '正在打开…';
    Bitmap.Canvas.Font.Color := UpdateMuted;
  end;
  Bitmap.Canvas.TextOut((Bitmap.Width - Bitmap.Canvas.TextWidth(Text)) div 2,
    (Bitmap.Height - Bitmap.Canvas.TextHeight(Text)) div 2, Text);
  SilentUpdateLaunchSurface.Invalidate;
end;

procedure SilentUpdateCloseClick(Sender: TObject);
begin
  if SilentUpdateFinished then SilentUpdateForm.Close;
end;

procedure SilentUpdateCloseQuery(Sender: TObject; var CanClose: Boolean);
begin
  CanClose := SilentUpdateFinished and (SilentUpdateAutoLaunchTimer = 0) and
    not SilentUpdateLaunchInProgress;
#ifdef SuperUpdatePreview
  if PreviewProgressPinned then CanClose := True;
#endif
end;

procedure KeepForegroundWizardHidden(Arg1: HWND; Arg2: UINT; Arg3: UINT_PTR; Arg4: DWORD);
begin
  if not IsForegroundUpdate() then
  begin
    if ForegroundAdvanceTimer <> 0 then
    begin
      KillTimer(0, ForegroundAdvanceTimer);
      ForegroundAdvanceTimer := 0;
    end;
    Exit;
  end;
  // Inno may re-show its native wizard after relay extraction. Keep it hidden
  // for the complete foreground lifecycle; only the custom update form is
  // allowed to become visible.
  WizardForm.Hide;
  ShowWindow(WizardForm.Handle, 0);
  PaintUpdateButton();
  if SilentUpdateProgressUnknown and Assigned(SilentUpdateProgressFill) then
  begin
    SilentUpdateProgressTick := (SilentUpdateProgressTick + ScaleX(12)) mod
      (SilentUpdateProgress.Width + SilentUpdateProgressFill.Width);
    SilentUpdateProgressFill.Left := SilentUpdateProgressTick - SilentUpdateProgressFill.Width;
  end;
end;

procedure RevealSilentUpdateForm();
begin
  // Older Super releases started the installer with Windows' SW_HIDE startup
  // flag. The first Show call honors that flag, so explicitly show the window
  // a second time and bring it forward for compatibility with those clients.
  SilentUpdateForm.Show;
  ShowWindow(SilentUpdateForm.Handle, 1);
  SetForegroundWindow(SilentUpdateForm.Handle);
end;

procedure StopAutoLaunchTimer();
begin
  if SilentUpdateAutoLaunchTimer <> 0 then
  begin
    KillTimer(0, SilentUpdateAutoLaunchTimer);
    SilentUpdateAutoLaunchTimer := 0;
  end;
end;

procedure ShowSilentUpdateLaunchFailure(ResultCode: Integer);
begin
  SilentUpdateLaunchInProgress := False;
  SilentUpdateTitle.Caption := '更新完成，暂时无法打开';
  SilentUpdateStatus.Caption := '新版本已安装。请重试打开，或从开始菜单启动 Super Lib。';
  SilentUpdateFooter.Caption := '更新已保存，无须重新下载安装。';
  SilentUpdateFooter.Width := ScaleX(292);
  SilentUpdateFooter.Top := ScaleY(223);
  SilentUpdateDivider.Visible := False;
  SilentUpdateLaunchSurface.Visible := True;
  SilentUpdateLaunchSurface.Enabled := True;
  SilentUpdateClose.Visible := True;
  SilentUpdateForm.ActiveControl := SilentUpdateLaunchSurface;
  PaintUpdateButton();
  Log('Update window: launch failed, code ' + IntToStr(ResultCode) + '.');
end;

procedure SilentUpdateLaunchClick(Sender: TObject);
var
  ResultCode: Integer;
  Launched: Boolean;
begin
  if not SilentUpdateFinished or SilentUpdateLaunchInProgress then
    Exit;
  // Disarm before Exec or any nested message loop: never launch twice.
  StopAutoLaunchTimer();
  SilentUpdateLaunchInProgress := True;
  SilentUpdateLaunchSurface.Enabled := False;
  SilentUpdateClose.Visible := False;
  SilentUpdateStatus.Caption := '正在打开 Super Lib，请稍候。';
  PaintUpdateButton();
  ResultCode := 0;
  Launched := False;
  try
#ifdef SuperUpdatePreview
    // The isolated preview never starts or updates an installed application.
    PreviewLaunchAttempts := PreviewLaunchAttempts + 1;
    Log('Update window: preview launch attempt ' + IntToStr(PreviewLaunchAttempts) + '.');
    Launched := not ((ExpandConstant('{param:PREVIEWLAUNCHFAIL|0}') = '1') and
      (PreviewLaunchAttempts = 1));
    if not Launched then ResultCode := 2;
#else
    Launched := ExecAsOriginalUser(
      ExpandConstant('{app}\Super.exe'),
      '--updated',
      ExpandConstant('{app}'),
      SW_SHOWNORMAL,
      ewNoWait,
      ResultCode
    );
#endif
  except
    Log('Update window: launch exception: ' + GetExceptionMessage);
  end;
  if not Launched then
  begin
    ShowSilentUpdateLaunchFailure(ResultCode);
    Exit;
  end;
  Log('Update window: launch succeeded.');
  SilentUpdateLaunchInProgress := False;
  SilentUpdateForm.Close;
end;

procedure AutoLaunchUpdatedApp(Arg1: HWND; Arg2: UINT; Arg3: UINT_PTR; Arg4: DWORD);
begin
  // KillTimer does not remove an already queued WM_TIMER. Ignore stale
  // callbacks, especially after a failed launch exposes manual retry.
  if (SilentUpdateAutoLaunchTimer = 0) or (Arg3 <> SilentUpdateAutoLaunchTimer) then Exit;
  SilentUpdateLaunchClick(SilentUpdateForm);
end;

procedure SilentUpdateKeyDown(Sender: TObject; var Key: Word; Shift: TShiftState);
begin
  if not SilentUpdateFinished or (SilentUpdateAutoLaunchTimer <> 0) or
    SilentUpdateLaunchInProgress then Exit;
  if (Key = 27) or (((Key = 13) or (Key = 32)) and SilentUpdateClose.Focused) then
  begin
    Key := 0;
    SilentUpdateCloseClick(Sender);
  end
  else if ((Key = 13) or ((Key = 32) and SilentUpdateLaunchSurface.Focused)) and SilentUpdateLaunchSurface.Enabled then
  begin
    Key := 0;
    SilentUpdateLaunchClick(Sender);
  end;
end;

function UpdateLabel(Left, Top, Width, Height, FontSize: Integer; Text: String; Color: TColor): TNewStaticText;
begin
  Result := TNewStaticText.Create(SilentUpdateForm);
  Result.Parent := SilentUpdateCard;
  Result.AutoSize := False;
  Result.SetBounds(ScaleX(Left), ScaleY(Top), ScaleX(Width), ScaleY(Height));
  Result.Caption := Text;
  Result.Color := UpdateSurface;
  Result.Font.Name := 'Microsoft YaHei UI';
  Result.Font.Size := FontSize;
  Result.Font.Color := Color;
  Result.StyleElements := [];
end;

procedure InitializeWizard();
var
  Corner: Integer;
  Bitmap: TBitmap;
begin
  if not IsForegroundUpdate() then
    Exit;

  WizardForm.Hide;

  SilentUpdateForm := CreateCustomForm(ScaleX(500), ScaleY(260), False, False);
  // A frameless surface avoids the white, native setup title bar. The quiet
  // dark palette deliberately leaves the installer as a utility, not a card.
  SilentUpdateForm.Caption := 'Super Lib 更新';
  SilentUpdateForm.Color := UpdateSurface;
  SilentUpdateForm.Position := poScreenCenter;
  SilentUpdateForm.BorderStyle := bsNone;
  // CreateCustomForm applies its own dialog/font scaling. Set the final
  // client size explicitly so it matches the ScaleX/ScaleY control layout.
  SilentUpdateForm.ClientWidth := ScaleX(500);
  SilentUpdateForm.ClientHeight := ScaleY(260);
  SilentUpdateForm.BorderIcons := [];
  SilentUpdateForm.FormStyle := fsStayOnTop;
  SilentUpdateForm.StyleElements := [];
  SilentUpdateForm.KeyPreview := True;
  SilentUpdateForm.OnKeyDown := @SilentUpdateKeyDown;
  SilentUpdateForm.OnCloseQuery := @SilentUpdateCloseQuery;
  // System-rounded corners where supported. Older Windows keeps a plain,
  // borderless rectangle; failure must never interrupt installation.
  try
    Corner := 2;
    UpdateDwmAttribute(SilentUpdateForm.Handle, 33, Corner, 4);
  except
    Log('Update window: rounded corners unavailable.');
  end;
  // Subtle native translucency. Text and controls retain near-full opacity.
  UpdateSetWindowLong(SilentUpdateForm.Handle, -20,
    UpdateGetWindowLong(SilentUpdateForm.Handle, -20) or $00080000);
  UpdateSetLayeredAttributes(SilentUpdateForm.Handle, 0, 252, 2);

  SilentUpdateCard := TPanel.Create(SilentUpdateForm);
  SilentUpdateCard.Parent := SilentUpdateForm;
  SilentUpdateCard.Align := alClient;
  SilentUpdateCard.Color := UpdateSurface;
  SilentUpdateCard.ParentBackground := False;
  SilentUpdateCard.StyleElements := [];
  SilentUpdateCard.BevelOuter := bvNone;

  SilentUpdateBrand := UpdateLabel(24, 22, 260, 24, 10, 'Super Lib  /  软件更新', UpdateMuted);
  SilentUpdateVersion := UpdateLabel(316, 22, 126, 24, 10, 'v{#AppVersion}', UpdateMuted);
  SilentUpdateVersion.Alignment := taRightJustify;
  SilentUpdateTitle := UpdateLabel(24, 65, 452, 36, 17, '正在更新 Super Lib', UpdateText);
  SilentUpdateTitle.Font.Style := [fsBold];
  SilentUpdateStatus := UpdateLabel(24, 110, 452, 42, 10, '正在安装已下载的更新，请稍候。', UpdateMuted);
  SilentUpdateStatus.WordWrap := True;
  SilentUpdateProgressText := UpdateLabel(24, 163, 346, 24, 10, '准备安装', UpdateMuted);
  SilentUpdatePercent := UpdateLabel(386, 163, 90, 24, 10, '准备中', UpdateText);
  SilentUpdatePercent.Alignment := taRightJustify;

  // A flat track avoids OS themes overriding the application's blue with
  // the native green progress bar (including when its handle is recreated).
  SilentUpdateProgress := TPanel.Create(SilentUpdateForm);
  SilentUpdateProgress.Parent := SilentUpdateCard;
  SilentUpdateProgress.SetBounds(ScaleX(24), ScaleY(195), ScaleX(452), ScaleY(6));
  SilentUpdateProgress.BevelOuter := bvNone;
  SilentUpdateProgress.ParentBackground := False;
  SilentUpdateProgress.StyleElements := [];
  SilentUpdateProgress.Color := $004C433A;
  SilentUpdateProgressFill := TPanel.Create(SilentUpdateForm);
  SilentUpdateProgressFill.Parent := SilentUpdateProgress;
  SilentUpdateProgressFill.SetBounds(0, 0, ScaleX(120), SilentUpdateProgress.Height);
  SilentUpdateProgressFill.BevelOuter := bvNone;
  SilentUpdateProgressFill.ParentBackground := False;
  SilentUpdateProgressFill.StyleElements := [];
  SilentUpdateProgressFill.Color := UpdateBlue;
  SilentUpdateProgressUnknown := True;

  SilentUpdateDivider := TPanel.Create(SilentUpdateForm);
  SilentUpdateDivider.Parent := SilentUpdateCard;
  SilentUpdateDivider.SetBounds(ScaleX(24), ScaleY(218), ScaleX(452), ScaleY(1));
  SilentUpdateDivider.BevelOuter := bvNone;
  SilentUpdateDivider.ParentBackground := False;
  SilentUpdateDivider.StyleElements := [];
  SilentUpdateDivider.Color := $00453D35;
  SilentUpdateFooter := UpdateLabel(24, 230, 452, 38, 9, '更新完成后将自动打开软件，无须再次点击。', UpdateMuted);
  SilentUpdateFooter.WordWrap := True;

  SilentUpdateLaunchSurface := TBitmapButton.Create(SilentUpdateForm);
  SilentUpdateLaunchSurface.Parent := SilentUpdateCard;
  SilentUpdateLaunchSurface.SetBounds(ScaleX(332), ScaleY(212), ScaleX(144), ScaleY(36));
  SilentUpdateLaunchSurface.BackColor := UpdateSurface;
  SilentUpdateLaunchSurface.Caption := '重试打开';
  SilentUpdateLaunchSurface.Cursor := crHandPoint;
  SilentUpdateLaunchSurface.TabStop := True;
  SilentUpdateLaunchSurface.Enabled := False;
  SilentUpdateLaunchSurface.Visible := False;
  SilentUpdateLaunchSurface.OnClick := @SilentUpdateLaunchClick;
  SilentUpdateButtonState := -1;
  PaintUpdateButton();

  SilentUpdateClose := TBitmapButton.Create(SilentUpdateForm);
  SilentUpdateClose.Parent := SilentUpdateCard;
  SilentUpdateClose.SetBounds(ScaleX(448), ScaleY(20), ScaleX(28), ScaleY(28));
  SilentUpdateClose.BackColor := UpdateSurface;
  SilentUpdateClose.Caption := '稍后启动';
  SilentUpdateClose.Hint := '关闭更新窗口，稍后启动';
  SilentUpdateClose.ShowHint := True;
  SilentUpdateClose.TabStop := True;
  SilentUpdateClose.Visible := False;
  SilentUpdateClose.Cursor := crHandPoint;
  SilentUpdateClose.OnClick := @SilentUpdateCloseClick;
  Bitmap := SilentUpdateClose.Bitmap;
  Bitmap.Width := SilentUpdateClose.Width;
  Bitmap.Height := SilentUpdateClose.Height;
  Bitmap.Canvas.Brush.Color := UpdateSurface;
  Bitmap.Canvas.FillRect(UpdateRect(0, 0, Bitmap.Width, Bitmap.Height));
  Bitmap.Canvas.Pen.Color := UpdateMuted;
  Bitmap.Canvas.Pen.Width := ScaleX(1);
  Bitmap.Canvas.MoveTo(ScaleX(9), ScaleY(9));
  Bitmap.Canvas.LineTo(ScaleX(19), ScaleY(19));
  Bitmap.Canvas.MoveTo(ScaleX(19), ScaleY(9));
  Bitmap.Canvas.LineTo(ScaleX(9), ScaleY(19));

  // The extracted relay can re-show its native wizard after initialization.
  // Continuously suppress it while this foreground update process is alive.
  ForegroundAdvanceTimer := SetTimer(
    0,
    0,
    120,
    CreateCallback(@KeepForegroundWizardHidden)
  );
end;

// InitializeWizard runs before Inno displays its own window. Hide it again
// when its first page is activated, otherwise the foreground relay can leave
// the standard "Ready to Install" window visible behind the update page.
procedure CurPageChanged(CurPageID: Integer);
begin
  if IsForegroundUpdate() then
    WizardForm.Hide;
end;

procedure ShowSilentUpdateProgress();
begin
  if IsForegroundUpdate() and Assigned(SilentUpdateForm) then
  begin
    RevealSilentUpdateForm();
  end;
end;

procedure UpdateSilentUpdateProgress(CurProgress, MaxProgress: Integer);
var
  Percent: Integer;
  ProgressRatio: Extended;
begin
#ifdef SuperUpdatePreview
  if PreviewProgressPinned then Exit;
#endif
  if SilentUpdateFinished or not IsForegroundUpdate() or not Assigned(SilentUpdateForm) then
    Exit;
  if MaxProgress <= 0 then
  begin
    SilentUpdateProgressUnknown := True;
    SilentUpdateProgressFill.Width := ScaleX(120);
    SilentUpdateProgressText.Caption := '正在应用更新…';
    SilentUpdatePercent.Caption := '准备中';
    Exit;
  end;
  // Inno progress counters may exceed 21 million; multiply as floating point
  // to avoid overflowing a 32-bit Integer before division.
  ProgressRatio := CurProgress;
  Percent := Round(ProgressRatio * 100 / MaxProgress);
  if Percent < 0 then Percent := 0;
  if Percent > 100 then Percent := 100;
  SilentUpdateProgressUnknown := False;
  SilentUpdateProgressFill.Left := 0;
  ProgressRatio := Percent;
  SilentUpdateProgressFill.Width := Round(SilentUpdateProgress.Width * ProgressRatio / 100);
  SilentUpdateProgressText.Caption := '正在安装更新';
  SilentUpdatePercent.Caption := IntToStr(Percent) + '%';
end;

procedure ShowSilentUpdateCompletion();
begin
  if not IsForegroundUpdate() or not Assigned(SilentUpdateForm) then
    Exit;
  SilentUpdateFinished := True;
  SilentUpdateProgressUnknown := False;
  SilentUpdateProgressFill.Left := 0;
  SilentUpdateProgressFill.Width := SilentUpdateProgress.Width;
  SilentUpdateTitle.Caption := '更新已完成';
  SilentUpdateStatus.Caption := '正在打开 Super Lib v{#AppVersion}，即将返回工作区。';
  SilentUpdateProgressText.Caption := '安装完成';
  SilentUpdatePercent.Caption := '100%';
  SilentUpdateFooter.Caption := '软件打开后，此窗口会自动关闭。';
  SilentUpdateLaunchSurface.Visible := False;
  SilentUpdateClose.Visible := False;
  // The form is already shown modelessly while files are copied. Inno cannot
  // convert a visible form directly into a modal one, so hide it first.
  SilentUpdateForm.Hide;
  // Let the completed state paint before opening the app. This timer runs
  // inside ShowModal's message loop, without blocking painting or input.
#ifdef SuperUpdatePreview
  if ExpandConstant('{param:PREVIEWCOMPLETIONHOLD|0}') <> '1' then
#endif
  begin
    SilentUpdateAutoLaunchTimer := SetTimer(0, 0, 1000, CreateCallback(@AutoLaunchUpdatedApp));
    if SilentUpdateAutoLaunchTimer = 0 then ShowSilentUpdateLaunchFailure(0);
  end;
  SilentUpdateForm.ShowModal;
  StopAutoLaunchTimer();
end;

procedure DeinitializeSetup();
begin
  StopAutoLaunchTimer();
  if ForegroundAdvanceTimer <> 0 then
  begin
    KillTimer(0, ForegroundAdvanceTimer);
    ForegroundAdvanceTimer := 0;
  end;
end;
