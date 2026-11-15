# Turns ONE recording of the Tamil letters, read in order with a pause
# between each, into one clean clip per letter in public/audio.
#
#   .\scripts\split-recording.ps1 -File "consonants.m4a"                 # the 18 consonants
#   .\scripts\split-recording.ps1 -File "vowels.m4a" -Set vowels         # the 12 vowels + ஃ
#   .\scripts\split-recording.ps1 -File "x.m4a" -DryRun                  # only show what it found
#
# Reading order (pause about one second between letters):
#   consonants: க ங ச ஞ ட ண த ந ப ம ய ர ல வ ழ ள ற ன
#   vowels:     அ ஆ இ ஈ உ ஊ எ ஏ ஐ ஒ ஓ ஔ ஃ
#
# Needs ffmpeg (installed on the HQ PC through WinGet).
param(
  [Parameter(Mandatory = $true)][string]$File,
  [ValidateSet("consonants", "vowels")][string]$Set = "consonants",
  [double]$SilenceDb = -35,
  [double]$MinPause = 0.35,
  [switch]$DryRun
)
# ffmpeg writes its report to stderr; do not treat that as an error.
$ErrorActionPreference = "Continue"
$letters = if ($Set -eq "vowels") {
  @('அ','ஆ','இ','ஈ','உ','ஊ','எ','ஏ','ஐ','ஒ','ஓ','ஔ','ஃ')
} else {
  @('க','ங','ச','ஞ','ட','ண','த','ந','ப','ம','ய','ர','ல','வ','ழ','ள','ற','ன')
}
$ff = (Get-Command ffmpeg -ErrorAction Stop).Source
$src = (Resolve-Path $File).Path
$out = Join-Path (Split-Path -Parent $PSScriptRoot) "public\audio"

# 1. Find the pauses.
$log = & $ff -hide_banner -i $src -af "silencedetect=n=${SilenceDb}dB:d=$MinPause" -f null - 2>&1 | Out-String
$total = [regex]::Match($log, 'Duration: (\d+):(\d+):([\d.]+)')
$length = [double]$total.Groups[1].Value * 3600 + [double]$total.Groups[2].Value * 60 + [double]$total.Groups[3].Value
$starts = @([regex]::Matches($log, 'silence_start: (\S+)') | % { [double]$_.Groups[1].Value })
$ends = @([regex]::Matches($log, 'silence_end: (\S+)') | % { [double]$_.Groups[1].Value })

# 2. Speech = the gaps between pauses.
$segments = @()
$cursor = 0.0
for ($i = 0; $i -lt $starts.Count; $i++) {
  if ($starts[$i] - $cursor -gt 0.12) { $segments += , @($cursor, $starts[$i]) }
  $cursor = if ($i -lt $ends.Count) { $ends[$i] } else { $length }
}
if ($length - $cursor -gt 0.12) { $segments += , @($cursor, $length) }

"Found $($segments.Count) sounds; expected $($letters.Count)."
if ($segments.Count -ne $letters.Count) {
  "Counts differ. Try -MinPause 0.5 (longer pauses) or -SilenceDb -30 (noisy room), or re-record with clearer pauses."
  $segments | % { "  {0:N2}s - {1:N2}s" -f $_[0], $_[1] }
  exit 1
}
if ($DryRun) {
  for ($i = 0; $i -lt $letters.Count; $i++) { "  {0}  {1:N2}s - {2:N2}s" -f $letters[$i], $segments[$i][0], $segments[$i][1] }
  exit 0
}

# 3. Cut, level to -1.5 dB peak, add a tiny lead-in and tail, save as mp3.
$tmp = Join-Path $env:TEMP "tamilearn-split.wav"
for ($i = 0; $i -lt $letters.Count; $i++) {
  $a = [math]::Max(0, $segments[$i][0] - 0.06); $b = [math]::Min($length, $segments[$i][1] + 0.08)
  & $ff -hide_banner -loglevel error -y -i $src -ss $a -to $b -ac 1 $tmp
  $vol = & $ff -hide_banner -i $tmp -af volumedetect -f null - 2>&1 | Out-String
  $peak = [double][regex]::Match($vol, 'max_volume: (\S+)').Groups[1].Value
  $gain = -1.5 - $peak
  $dest = Join-Path $out "$($letters[$i]).mp3"
  & $ff -hide_banner -loglevel error -y -i $tmp -af "volume=${gain}dB,afade=t=in:d=0.01,apad=pad_dur=0.1" -codec:a libmp3lame -b:a 128k $dest
  "  {0}  {1:N2}s  (+{2:N1} dB)" -f $letters[$i], ($b - $a), $gain
}
Remove-Item $tmp -ErrorAction SilentlyContinue
"Done: $($letters.Count) clips written to public\audio."
