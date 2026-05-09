param(
  [string]$SecretsPath = ".env.deploy.local"
)

$ErrorActionPreference = "Stop"

function Load-DotEnv {
  param([string]$Path)

  if (!(Test-Path $Path)) {
    throw "Secrets file not found: $Path. Copy .env.deploy.example to .env.deploy.local and fill it."
  }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (!$line -or $line.StartsWith("#")) { return }
    $parts = $line -split "=", 2
    if ($parts.Length -ne 2) { return }

    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    if ($name) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

function Require-Env {
  param([string[]]$Names)
  $missing = @()
  foreach ($name in $Names) {
    $value = [Environment]::GetEnvironmentVariable($name, "Process")
    if ([string]::IsNullOrWhiteSpace($value) -or $value -like "*YOUR_SUPABASE_PROJECT_REF*") {
      $missing += $name
    }
  }

  if ($missing.Length -gt 0) {
    throw "Missing required deployment values: $($missing -join ', ')"
  }
}

Load-DotEnv $SecretsPath

Require-Env @(
  "VERCEL_TOKEN",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_REF",
  "VITE_API_BASE_URL",
  "ENCRYPTION_KEY",
  "SERVICE_ROLE_KEY"
)

# Derived variables
$projectRef = [Environment]::GetEnvironmentVariable("SUPABASE_PROJECT_REF", "Process")
if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("SUPABASE_URL", "Process"))) {
  [Environment]::SetEnvironmentVariable("SUPABASE_URL", "https://$($projectRef).supabase.co", "Process")
}

if ([Environment]::GetEnvironmentVariable("ENCRYPTION_KEY", "Process").Length -ne 64) {
  throw "ENCRYPTION_KEY must be a 64-character hex string."
}

npm.cmd exec tsc -- --noEmit
npm.cmd run build
npm.cmd run prepare:supabase-functions

$functionNames = Get-ChildItem -Directory "functions" |
  Where-Object { $_.Name -ne "_shared" } |
  ForEach-Object { $_.Name }

$serverSecretNames = @(
  "ENCRYPTION_KEY",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
  "REDDIT_CLIENT_ID",
  "REDDIT_CLIENT_SECRET",
  "REDDIT_REDIRECT_URI",
  "REDDIT_USER_AGENT",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_GSC_REDIRECT_URI",
  "GOOGLE_GMAIL_REDIRECT_URI",
  "SERVICE_ROLE_KEY"
)

$secretArgs = @()
foreach ($name in $serverSecretNames) {
  $value = [Environment]::GetEnvironmentVariable($name, "Process")
  if (![string]::IsNullOrWhiteSpace($value) -and $value -notlike "*YOUR_SUPABASE_PROJECT_REF*") {
    $secretArgs += "$name=$value"
  }
}

if ($secretArgs.Length -gt 0) {
  npx.cmd supabase secrets set @secretArgs --project-ref $env:SUPABASE_PROJECT_REF
}

foreach ($functionName in $functionNames) {
  npx.cmd supabase functions deploy $functionName --project-ref $env:SUPABASE_PROJECT_REF
}

$vercelSecrets = @{
  "VITE_API_BASE_URL" = $env:VITE_API_BASE_URL;
  "VITE_OPENROUTER_API_KEY" = $env:VITE_OPENROUTER_API_KEY;
  "VITE_GEMINI_API_KEY" = $env:VITE_GEMINI_API_KEY;
  "VITE_SUPABASE_ANON_KEY" = $env:VITE_SUPABASE_ANON_KEY;
  "VITE_SUPABASE_URL" = $env:SUPABASE_URL;
}

foreach ($name in $vercelSecrets.Keys) {
  $value = $vercelSecrets[$name]
  if (![string]::IsNullOrWhiteSpace($value) -and $value -notlike "*YOUR_SUPABASE_PROJECT_REF*") {
    Write-Host "Updating Vercel env: $name"
    # Try to remove first, ignore errors if it doesn't exist
    & {
      $ErrorActionPreference = "SilentlyContinue"
      npx.cmd vercel env rm $name production --token $env:VERCEL_TOKEN --scope team_2UN4IqFo3WprS46U1f98Ud0u --yes 2>$null
    }
    npx.cmd vercel env add $name production --value $value --token $env:VERCEL_TOKEN --scope team_2UN4IqFo3WprS46U1f98Ud0u --yes
  }
}


npx.cmd vercel link --yes --token $env:VERCEL_TOKEN --scope team_2UN4IqFo3WprS46U1f98Ud0u
npx.cmd vercel --prod --yes --token $env:VERCEL_TOKEN --scope team_2UN4IqFo3WprS46U1f98Ud0u
