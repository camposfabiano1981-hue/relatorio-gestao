# Servidor local de teste (não é necessário para usar a plataforma).
# Entrega os arquivos do projeto em http://localhost:8765/ e permite conferir os documentos gerados:
#   POST /__save?name=arquivo   grava o corpo da requisição em $OutDir
#   GET  /__out/arquivo         devolve um arquivo de $OutDir
# Uso: powershell -ExecutionPolicy Bypass -File dev\servidor-teste.ps1 -OutDir C:\temp\saida
param([string]$Root = (Split-Path $PSScriptRoot), [string]$OutDir = (Join-Path $env:TEMP 'rg-saida'), [int]$Port = 8765)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutDir | Out-Null
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
           '.json'='application/json'; '.png'='image/png'; '.pdf'='application/pdf' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Output "Servindo $Root em http://localhost:$Port/ (saída: $OutDir)"
while ($l.IsListening) {
  $ctx = $l.GetContext()
  $req = $ctx.Request; $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($req.HttpMethod -eq 'POST' -and $path -eq '/__save') {
      $name = [IO.Path]::GetFileName($req.QueryString['name'])
      $ms = New-Object IO.MemoryStream
      $req.InputStream.CopyTo($ms)
      [IO.File]::WriteAllBytes((Join-Path $OutDir $name), $ms.ToArray())
      $b = [Text.Encoding]::UTF8.GetBytes("ok $($ms.Length)")
      $res.OutputStream.Write($b, 0, $b.Length)
    } else {
      if ($path -eq '/') { $path = '/index.html' }
      $file = if ($path.StartsWith('/__out/')) { Join-Path $OutDir ([IO.Path]::GetFileName($path)) } else { Join-Path $Root $path.TrimStart('/') }
      if (Test-Path $file -PathType Leaf) {
        $ext = [IO.Path]::GetExtension($file)
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $res.Headers.Add('Cache-Control', 'no-store')
        $bytes = [IO.File]::ReadAllBytes($file)
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else { $res.StatusCode = 404 }
    }
  } catch { $res.StatusCode = 500 } finally { $res.Close() }
}
