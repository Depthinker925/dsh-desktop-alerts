# dsh-desktop-alerts renderer
#
# Reads one UTF-8 JSON payload and shows a single always-on-top card in the
# bottom-right (configurable) corner of the primary screen. The card never
# steals keyboard focus; clicking it brings the DSH window to the front.
#
# This file is intentionally ASCII-only: Windows PowerShell 5.1 decodes a
# script file with the ANSI code page unless it starts with a UTF-8 BOM, so all
# localised text arrives through the payload file instead of the source.
#
# Usage: powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass \
#          -WindowStyle Hidden -File notify.ps1 -Payload <payload.json>

param(
  [Parameter(Mandatory = $true)][string]$Payload
)

$ErrorActionPreference = 'Stop'

function Read-Payload([string]$path) {
  $raw = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  return $raw | ConvertFrom-Json
}

function Get-Text($value, [string]$fallback) {
  if ($null -eq $value) { return $fallback }
  $text = [string]$value
  if ($text.Trim().Length -eq 0) { return $fallback }
  return $text
}

function ConvertTo-Brush([string]$hex) {
  if ($hex -match '^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$') {
    return (New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.ColorConverter]::ConvertFromString($hex)))
  }
  return (New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.ColorConverter]::ConvertFromString('#4D6BFE')))
}

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class DshNotifyNative {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();

    public static bool Activate(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return false;
        ShowWindow(hWnd, 9); // SW_RESTORE
        BringWindowToTop(hWnd);
        if (SetForegroundWindow(hWnd)) return true;
        // Windows blocks SetForegroundWindow from a background process unless
        // it saw recent user input; a synthetic ALT keypress satisfies that.
        keybd_event(0x12, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(40);
        bool ok = SetForegroundWindow(hWnd);
        keybd_event(0x12, 0, 2, UIntPtr.Zero);
        return ok;
    }
}
"@

try { [DshNotifyNative]::SetProcessDPIAware() | Out-Null } catch { }

$p = Read-Payload $Payload

$title = Get-Text $p.title 'DeepSeek Harness'
$body = Get-Text $p.body ''
$meta = Get-Text $p.meta ''
$glyph = Get-Text $p.glyph 'D'
$accentHex = Get-Text $p.accent '#4D6BFE'
$position = (Get-Text $p.position 'bottom-right').ToLowerInvariant()
$clickAction = (Get-Text $p.clickAction 'focus').ToLowerInvariant()
$openUrl = Get-Text $p.url ''
$processName = Get-Text $p.processName 'DeepSeek Harness'
$stackIndex = 0
if ($null -ne $p.stackIndex) { try { $stackIndex = [int]$p.stackIndex } catch { $stackIndex = 0 } }
$durationMs = 12000
if ($null -ne $p.durationMs) { try { $durationMs = [int]$p.durationMs } catch { $durationMs = 12000 } }
if ($durationMs -lt 3000) { $durationMs = 3000 }

$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        ShowInTaskbar="False" ShowActivated="False" Topmost="True"
        ResizeMode="NoResize" SizeToContent="Height" Width="392" Opacity="0"
        Title="DSH notification">
  <Border x:Name="Card" Background="#F2171B22" CornerRadius="12"
          BorderBrush="#24FFFFFF" BorderThickness="1">
    <Border.Effect>
      <DropShadowEffect BlurRadius="26" ShadowDepth="5" Opacity="0.55" Color="#FF000000"/>
    </Border.Effect>
    <Grid>
      <Grid.ColumnDefinitions>
        <ColumnDefinition Width="Auto"/>
        <ColumnDefinition Width="*"/>
      </Grid.ColumnDefinitions>
      <Border x:Name="Accent" Grid.Column="0" Width="3" CornerRadius="2"
              Margin="12,14,0,14" Background="#FF4D6BFE"/>
      <StackPanel Grid.Column="1" Margin="12,12,16,13">
        <StackPanel Orientation="Horizontal">
          <Border x:Name="Badge" Width="28" Height="28" CornerRadius="8" Background="#FF4D6BFE">
            <TextBlock x:Name="GlyphText" Foreground="White" FontSize="14" FontWeight="Bold"
                       HorizontalAlignment="Center" VerticalAlignment="Center"/>
          </Border>
          <StackPanel Margin="9,0,0,0" VerticalAlignment="Center">
            <TextBlock x:Name="TitleText" Foreground="#FFF4F6FA" FontSize="13.5" FontWeight="SemiBold"
                       TextTrimming="CharacterEllipsis" MaxWidth="310"/>
            <TextBlock x:Name="MetaText" Foreground="#FF8C95A8" FontSize="11"
                       TextTrimming="CharacterEllipsis" Margin="0,1,0,0" MaxWidth="310"/>
          </StackPanel>
        </StackPanel>
        <TextBlock x:Name="BodyText" Foreground="#FFC9D0DC" FontSize="12.5" TextWrapping="Wrap"
                   Margin="0,9,0,0" MaxHeight="150" LineHeight="18"/>
      </StackPanel>
    </Grid>
  </Border>
</Window>
"@

$reader = New-Object System.Xml.XmlNodeReader ([xml]$xaml)
$win = [System.Windows.Markup.XamlReader]::Load($reader)

$accentBrush = ConvertTo-Brush $accentHex
$win.FindName('Accent').Background = $accentBrush
$win.FindName('Badge').Background = $accentBrush
$win.FindName('TitleText').Text = $title
$win.FindName('MetaText').Text = $meta
$win.FindName('MetaText').Visibility = if ($meta.Length -gt 0) { 'Visible' } else { 'Collapsed' }
$win.FindName('BodyText').Text = $body
$win.FindName('BodyText').Visibility = if ($body.Length -gt 0) { 'Visible' } else { 'Collapsed' }
$win.FindName('GlyphText').Text = $glyph

if ($null -ne $p.titleSize) { try { $win.FindName('TitleText').FontSize = [double]$p.titleSize } catch { } }

# Per-kind accent tint for the badge only; the left bar keeps the accent colour.
if ($null -ne $p.badge) { try { $win.FindName('Badge').Background = ConvertTo-Brush ([string]$p.badge) } catch { } }

$win.Add_Loaded({
  $workArea = [System.Windows.SystemParameters]::WorkArea
  $gap = 14
  $stackStep = [double]([Math]::Max(0, $stackIndex)) * ($win.ActualHeight + 8)
  $bottomOffset = $gap + $stackStep
  switch ($position) {
    'top-left' {
      $win.Left = $workArea.Left + $gap
      $win.Top = $workArea.Top + $gap + $stackStep
    }
    'top-right' {
      $win.Left = $workArea.Right - $win.ActualWidth - $gap
      $win.Top = $workArea.Top + $gap + $stackStep
    }
    'bottom-left' {
      $win.Left = $workArea.Left + $gap
      $win.Top = $workArea.Bottom - $win.ActualHeight - $bottomOffset
    }
    'center' {
      $win.Left = $workArea.Left + ($workArea.Width - $win.ActualWidth) / 2
      $win.Top = $workArea.Top + ($workArea.Height - $win.ActualHeight) / 2
    }
    default {
      $win.Left = $workArea.Right - $win.ActualWidth - $gap
      $win.Top = $workArea.Bottom - $win.ActualHeight - $bottomOffset
    }
  }

  $fadeIn = New-Object System.Windows.Media.Animation.DoubleAnimation
  $fadeIn.From = 0.0
  $fadeIn.To = 1.0
  $fadeIn.Duration = [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(180))
  $win.BeginAnimation([System.Windows.Window]::OpacityProperty, $fadeIn)

  $slide = New-Object System.Windows.Media.Animation.DoubleAnimation
  $slide.From = 14.0
  $slide.To = 0.0
  $slide.Duration = [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(220))
  $slide.EasingFunction = (New-Object System.Windows.Media.Animation.CubicEase -Property @{ EasingMode = 'EaseOut' })
  $translate = New-Object System.Windows.Media.TranslateTransform
  $win.FindName('Card').RenderTransform = $translate
  $translate.BeginAnimation([System.Windows.Media.TranslateTransform]::YProperty, $slide)
})

$closeOnce = $false
$close = {
  if ($script:closeOnce) { return }
  $script:closeOnce = $true
  $fadeOut = New-Object System.Windows.Media.Animation.DoubleAnimation
  $fadeOut.To = 0.0
  $fadeOut.Duration = [System.Windows.Duration]::new([TimeSpan]::FromMilliseconds(160))
  $fadeOut.Add_Completed({
    try { $win.Close() } catch { }
    try { $script:frame.Continue = $false } catch { }
  })
  $win.BeginAnimation([System.Windows.Window]::OpacityProperty, $fadeOut)
}

$win.Add_MouseLeftButtonUp({
  & $close
  try {
    if ($clickAction -eq 'focus') {
      $target = Get-Process -Name $processName -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
      if ($null -ne $target) {
        [DshNotifyNative]::Activate($target.MainWindowHandle) | Out-Null
      } elseif ($openUrl.Length -gt 0) {
        Start-Process $openUrl | Out-Null
      }
    } elseif ($clickAction -eq 'url' -and $openUrl.Length -gt 0) {
      Start-Process $openUrl | Out-Null
    }
  } catch { }
})

$win.Add_KeyDown({
  param($sender, $e)
  if ($e.Key -eq 'Escape') { & $close }
})

$win.Add_Closed({
  try { $script:frame.Continue = $false } catch { }
})

if ($null -ne $p.sound -and $p.sound -eq $true) {
  $soundName = (Get-Text $p.soundName 'asterisk').ToLowerInvariant()
  try {
    switch ($soundName) {
      'beep' { [System.Media.SystemSounds]::Beep.Play() }
      'exclamation' { [System.Media.SystemSounds]::Exclamation.Play() }
      'hand' { [System.Media.SystemSounds]::Hand.Play() }
      'question' { [System.Media.SystemSounds]::Question.Play() }
      'none' { }
      default { [System.Media.SystemSounds]::Asterisk.Play() }
    }
  } catch { }
}

$script:frame = New-Object System.Windows.Threading.DispatcherFrame
$autoClose = New-Object System.Windows.Threading.DispatcherTimer
$autoClose.Interval = [TimeSpan]::FromMilliseconds([Math]::Max(500, $durationMs - 200))
$autoClose.Add_Tick({
  $autoClose.Stop()
  & $close
})
$script:autoClose = $autoClose

$win.Show()
$autoClose.Start()
[System.Windows.Threading.Dispatcher]::PushFrame($script:frame)

try { $win.Close() } catch { }
exit 0
