param([switch]$ValidateOnly,[string]$ValidationRoot)
$ErrorActionPreference='Stop'
$kitRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest=Get-Content -LiteralPath (Join-Path $kitRoot 'manifest.json') -Raw | ConvertFrom-Json
$seven=Join-Path $kitRoot 'Tools\7za.exe'

function Update-Stage([int]$Percent,[string]$Message) {
  if($script:status){$script:status.Text=$Message;$script:progress.Value=[Math]::Min(100,$Percent);[Windows.Forms.Application]::DoEvents()}
}
function Run-Component([string]$File,[string[]]$Arguments,[switch]$Visible) {
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$File
  $info.Arguments=($Arguments | ForEach-Object {'"'+$_.Replace('"','\"')+'"'}) -join ' '
  $info.UseShellExecute=[bool]$Visible;$info.CreateNoWindow=-not $Visible
  if($Visible){$info.Verb='runas'}
  else{$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true}
  $process=[Diagnostics.Process]::Start($info)
  if($script:progress){$script:progress.Style='Marquee';$script:progress.MarqueeAnimationSpeed=25}
  if(-not $Visible){$outTask=$process.StandardOutput.ReadToEndAsync();$errTask=$process.StandardError.ReadToEndAsync()}
  while(-not $process.WaitForExit(150)){if($script:status){[Windows.Forms.Application]::DoEvents()}}
  if($script:progress){$script:progress.Style='Continuous'}
  if($process.ExitCode -notin @(0,3010,1638)){throw "A setup component failed ($($process.ExitCode)): $([IO.Path]::GetFileName($File))."}
}
function Get-Sha256File([string]$File) {
  $stream=[IO.File]::OpenRead($File)
  $algorithm=[Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-','') }
  finally { $stream.Dispose();$algorithm.Dispose() }
}
function Verify-Kit {
  $index=0
  foreach($file in $manifest.files){
    $path=[IO.Path]::GetFullPath((Join-Path $kitRoot $file.path))
    if(-not $path.StartsWith($kitRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid package path.'}
    if(!(Test-Path -LiteralPath $path -PathType Leaf)){throw "Missing download file: $($file.path). Extract the whole download folder."}
    Update-Stage ([int](2+10*$index/$manifest.files.Count)) "Checking download: $($file.path)"
    if((Get-Sha256File $path) -ne $file.sha256){throw "Incomplete or modified download: $($file.path). Download that file again."}
    $index++
  }
}
function Merge-Json([string]$File,[hashtable]$Values) {
  $data=@{}
  if(Test-Path -LiteralPath $File){$old=Get-Content -LiteralPath $File -Raw | ConvertFrom-Json;foreach($p in $old.PSObject.Properties){$data[$p.Name]=$p.Value}}
  foreach($key in $Values.Keys){$data[$key]=$Values[$key]}
  [IO.Directory]::CreateDirectory((Split-Path $File)) | Out-Null
  [IO.File]::WriteAllText($File,($data | ConvertTo-Json -Depth 10),(New-Object Text.UTF8Encoding($false)))
}
function Configure-RLM([string]$Runtime,[string]$AppDataRoot,[string]$GamePath) {
  $folder=Join-Path $AppDataRoot 'rl-manager'
  Merge-Json (Join-Path $folder 'runtime-location.json') @{path=$Runtime}
  $preferences=Join-Path $folder 'player-preferences.json'
  $integration=@{}
  if(Test-Path -LiteralPath $preferences){$old=Get-Content -LiteralPath $preferences -Raw | ConvertFrom-Json;if($old.integration){foreach($p in $old.integration.PSObject.Properties){$integration[$p.Name]=$p.Value}}}
  $integration.botPack=Join-Path $Runtime 'botpack'
  if($GamePath){$integration.rocketLeague=$GamePath}
  Merge-Json $preferences @{integration=$integration}
}
function Add-Lines([string]$File,[string[]]$Lines){
  $text=if(Test-Path -LiteralPath $File){[IO.File]::ReadAllText($File)}else{''}
  foreach($line in $Lines){if(($text -split '\r?\n') -notcontains $line){$text=$text.TrimEnd()+[Environment]::NewLine+$line+[Environment]::NewLine}}
  [IO.Directory]::CreateDirectory((Split-Path $File))|Out-Null
  [IO.File]::WriteAllText($File,$text,(New-Object Text.UTF8Encoding($false)))
}
function Configure-Bakkes([string]$Root){
  Add-Lines (Join-Path $Root 'cfg\plugins.cfg') @('plugin load rconplugin','plugin load serverhost','plugin load rlmanagerhud')
  Add-Lines (Join-Path $Root 'data\rcon_commands.cfg') @('ws_inventory','sendback','rcon_password','plugin','cl_settings_refreshplugins','rcon_refresh_allowed','disconnect','unreal_command','open','rlm_host_arm','rlm_host_stop','rlm_host_ready','rlm_hud_enabled','rlm_scoreboard_enabled')
  $cfg=Join-Path $Root 'cfg\config.cfg'
  $text=if(Test-Path -LiteralPath $cfg){[IO.File]::ReadAllText($cfg)}else{''}
  if($text -notmatch 'rcon_password\s+"[^"]+"'){
    $secret=([Guid]::NewGuid().ToString('N')+[Guid]::NewGuid().ToString('N'))
    Add-Lines $cfg @("rcon_password `"$secret`"")
  }
}
function Find-Game {
  $candidates=@('C:\Program Files\Epic Games\rocketleague\Binaries\Win64\RocketLeague.exe','C:\Program Files (x86)\Steam\steamapps\common\rocketleague\Binaries\Win64\RocketLeague.exe','D:\Epic Games\rocketleague\Binaries\Win64\RocketLeague.exe','D:\SteamLibrary\steamapps\common\rocketleague\Binaries\Win64\RocketLeague.exe')
  $epic=Join-Path $env:ProgramData 'Epic\EpicGamesLauncher\Data\Manifests'
  if(Test-Path -LiteralPath $epic){foreach($item in Get-ChildItem -LiteralPath $epic -Filter '*.item'){try{$game=Get-Content -LiteralPath $item.FullName -Raw|ConvertFrom-Json;if($game.InstallLocation){$candidates+=Join-Path $game.InstallLocation 'Binaries\Win64\RocketLeague.exe'}}catch{}}}
  return ($candidates|Where-Object {Test-Path -LiteralPath $_ -PathType Leaf}|Select-Object -First 1)
}

if($ValidateOnly){
  if(!$ValidationRoot){throw 'Provide a disposable validation folder.'}
  $test=[IO.Path]::GetFullPath($ValidationRoot)
  if(Test-Path -LiteralPath $test){throw 'Validation folder must be new.'}
  [IO.Directory]::CreateDirectory($test)|Out-Null
  Verify-Kit
  $runtimeTest=Join-Path $test 'runtime with spaces'
  $profileTest=Join-Path $test 'profile'
  $prefsTest=Join-Path $profileTest 'rl-manager\player-preferences.json'
  Merge-Json $prefsTest @{audio=@{volume=0.4};integration=@{rocketLeague='Z:\Existing Game\RocketLeague.exe';customOption='preserved'}}
  Configure-RLM $runtimeTest $profileTest ''
  $result=Get-Content -LiteralPath $prefsTest -Raw|ConvertFrom-Json
  if($result.audio.volume -ne 0.4 -or $result.integration.customOption -ne 'preserved' -or $result.integration.rocketLeague -ne 'Z:\Existing Game\RocketLeague.exe' -or $result.integration.botPack -ne (Join-Path $runtimeTest 'botpack')){throw 'Setup did not preserve existing preferences.'}
  $location=Get-Content -LiteralPath (Join-Path $profileTest 'rl-manager\runtime-location.json') -Raw|ConvertFrom-Json
  if($location.path -ne $runtimeTest){throw 'Runtime registration failed.'}
  Configure-Bakkes (Join-Path $test 'bakkesmod')
  $first=Get-Content -LiteralPath (Join-Path $test 'bakkesmod\cfg\config.cfg') -Raw
  Configure-Bakkes (Join-Path $test 'bakkesmod')
  if($first -ne (Get-Content -LiteralPath (Join-Path $test 'bakkesmod\cfg\config.cfg') -Raw)){throw 'Setup is not idempotent.'}
  $existingBakkes=Join-Path $test 'existing bakkesmod'
  Add-Lines (Join-Path $existingBakkes 'cfg\config.cfg') @('rcon_password "existing-test-password"','custom_setting "preserved"')
  Configure-Bakkes $existingBakkes
  $existingText=Get-Content -LiteralPath (Join-Path $existingBakkes 'cfg\config.cfg') -Raw
  if($existingText -notmatch 'rcon_password "existing-test-password"' -or $existingText -notmatch 'custom_setting "preserved"' -or ([regex]::Matches($existingText,'rcon_password')).Count -ne 1){throw 'Setup changed an existing RCON password or setting.'}
  Write-Output 'COMPLETE_SETUP_VALIDATION_OK';exit
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$form=New-Object Windows.Forms.Form
$form.Text='RL Manager - Complete Setup';$form.ClientSize=New-Object Drawing.Size(690,425);$form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
$form.Icon=[Drawing.Icon]::ExtractAssociatedIcon((Join-Path $kitRoot 'Install RL Manager.exe'))
$form.BackColor=[Drawing.Color]::FromArgb(16,25,22);$form.ForeColor=[Drawing.Color]::White
$form.Font=New-Object Drawing.Font('Segoe UI',10)
$title=New-Object Windows.Forms.Label;$title.Text='YOUR NEXT CHAPTER STARTS HERE.';$title.Font=New-Object Drawing.Font('Segoe UI',18,[Drawing.FontStyle]::Bold);$title.SetBounds(28,25,640,40);$form.Controls.Add($title)
$intro=New-Object Windows.Forms.Label;$intro.Text="One setup for RLM, local bots, AI models, BakkesMod and Rocket Host.`r`nClose Rocket League, BakkesMod and RLM before continuing.`r`nRocket League itself and graphics drivers must already be installed.";$intro.SetBounds(30,85,630,85);$form.Controls.Add($intro)
$script:status=New-Object Windows.Forms.Label;$script:status.Text='Extracted the full download folder? Ready when you are.';$script:status.SetBounds(30,185,630,50);$form.Controls.Add($script:status)
$script:progress=New-Object Windows.Forms.ProgressBar;$script:progress.SetBounds(30,245,630,22);$form.Controls.Add($script:progress)
$hint=New-Object Windows.Forms.Label;$hint.Text='Allow about 30 GB free during setup. Caster One/Caster Two speech uses a compatible GPU or the CPU on AMD/Intel systems. CPU generation can be slower. Hosted games need internet.';$hint.SetBounds(30,285,620,50);$hint.ForeColor=[Drawing.Color]::Silver;$form.Controls.Add($hint)
$button=New-Object Windows.Forms.Button;$button.Text='Install everything';$button.SetBounds(420,350,240,45);$button.BackColor=[Drawing.Color]::FromArgb(181,237,165);$button.ForeColor=[Drawing.Color]::Black;$button.FlatStyle='Flat';$form.Controls.Add($button)
$script:installing=$false
$form.Add_FormClosing({if($script:installing){$_.Cancel=$true}})
$button.Add_Click({
  if($script:done){$form.Close();return}
  $script:installing=$true;$button.Enabled=$false
  try{
    foreach($name in @('RocketLeague','BakkesMod','RL Manager')){if(Get-Process -Name $name -ErrorAction SilentlyContinue){throw "Close $name first, then click Install everything again."}}
    Verify-Kit
    Update-Stage 14 'Installing Microsoft runtime libraries. Windows may ask for permission...'
    Run-Component (Join-Path $kitRoot 'Packages\vc_redist.x64.exe') @('/install','/quiet','/norestart') -Visible
    $runtimeVersion=if($manifest.runtimeVersion){$manifest.runtimeVersion}else{$manifest.version}
    $target=Join-Path $env:LOCALAPPDATA ('RLManagerRuntime\'+$runtimeVersion)
    $marker=Join-Path $target '.complete-runtime.json'
    if(!(Test-Path -LiteralPath $marker)){
      Update-Stage 18 'Unpacking Python, bots and AI. This can take several minutes...'
      [IO.Directory]::CreateDirectory($target)|Out-Null
      Run-Component $seven @('x','-y','-bd',('-o'+$target),(Join-Path $kitRoot 'Packages\Runtime.7z.001'))
    }
    Update-Stage 50 'Checking the portable bot and speech libraries...'
    foreach($required in @('python\python.exe','botpack\Necto\Nexto\bot.cfg','llama\llama-server.exe','text_model\qwen2.5-1.5b-instruct-q4_k_m.gguf','chatterbox_model\t3_cfg.safetensors','chatterbox_model\s3gen.safetensors')){
      if(!(Test-Path -LiteralPath (Join-Path $target $required) -PathType Leaf)){throw "A runtime file is missing: $required. Remove only this version's runtime folder and rerun setup."}
    }
    Run-Component (Join-Path $target 'python\python.exe') @('-I','-c','import rlbot,torch,torchaudio,chatterbox,websocket; from chatterbox.tts import ChatterboxTTS')
    $core=Join-Path $target 'bakkes-core'
    Run-Component $seven @('x','-y','-bd',('-o'+$core),(Join-Path $kitRoot 'Packages\BakkesModCore.zip'))
    $bakkes=Join-Path $env:APPDATA 'bakkesmod\bakkesmod'
    foreach($file in Get-ChildItem -LiteralPath $core -Recurse -File){
      $rel=$file.FullName.Substring($core.Length).TrimStart('\');$dest=Join-Path $bakkes $rel
      if(!(Test-Path -LiteralPath $dest)){[IO.Directory]::CreateDirectory((Split-Path $dest))|Out-Null;Copy-Item -LiteralPath $file.FullName -Destination $dest}
    }
    Update-Stage 65 'Installing official BakkesMod. Windows may ask for permission...'
    Run-Component (Join-Path $kitRoot 'Packages\BakkesModSetup.exe') @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-') -Visible
    Run-Component $seven @('x','-y','-bd',('-o'+$bakkes),(Join-Path $kitRoot 'Packages\RocketHost.zip'))
    Configure-Bakkes $bakkes
    Update-Stage 78 'Installing RL Manager and its career HUD...'
    Run-Component (Join-Path $kitRoot 'Packages\RLManagerSetup.exe') @('/S')
    Configure-RLM $target $env:APPDATA (Find-Game)
    [IO.File]::WriteAllText($marker,(@{runtimeId=$manifest.runtimeId;version=$manifest.version}|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
    Update-Stage 100 'Ready! Open RL Manager from its desktop or Start menu shortcut.'
    $script:done=$true;$button.Text='Finish';$button.Enabled=$true
  }catch{
    $script:status.Text=$_.Exception.Message
    [Windows.Forms.MessageBox]::Show($_.Exception.Message,'RLM setup needs attention','OK','Warning')|Out-Null
    $button.Enabled=$true
  }finally{$script:installing=$false}
})
[void]$form.ShowDialog()
