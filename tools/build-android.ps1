param(
    [string]$JdkPath,
    [string]$SdkPath,
    [switch]$Release
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not $JdkPath) {
    $localJdks = @(Get-ChildItem (Join-Path $root '.local\jdk') -Directory -ErrorAction SilentlyContinue)
    if ($localJdks.Count -eq 1) { $JdkPath = $localJdks[0].FullName }
    else { $JdkPath = $env:JAVA_HOME }
}
if (-not $SdkPath) {
    $localSdk = Join-Path $root '.local\android-sdk'
    if (Test-Path $localSdk) { $SdkPath = $localSdk }
    else { $SdkPath = $env:ANDROID_HOME }
}
if (-not $JdkPath -or -not (Test-Path (Join-Path $JdkPath 'bin\javac.exe'))) {
    throw 'Select an approved JDK 21 with -JdkPath or JAVA_HOME. This script does not install tools.'
}
if (-not $SdkPath -or -not (Test-Path (Join-Path $SdkPath 'platforms\android-36\android.jar'))) {
    throw 'Select an approved SDK containing Platform 36 with -SdkPath or ANDROID_HOME.'
}
$names = @('JAVA_HOME', 'ANDROID_HOME', 'ANDROID_USER_HOME', 'GRADLE_USER_HOME', 'PATH',
    'DRIFT_RELEASE_STORE', 'DRIFT_RELEASE_PASSWORD', 'DRIFT_RELEASE_ALIAS')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    $env:JAVA_HOME = $JdkPath
    $env:ANDROID_HOME = $SdkPath
    $env:ANDROID_USER_HOME = Join-Path $root '.local\android-user'
    $env:GRADLE_USER_HOME = Join-Path $root '.local\gradle'
    $env:PATH = "$JdkPath\bin;$env:PATH"
    if ($Release) {
        $credentialsPath = Join-Path $root '.local\release-signing.json'
        if (-not (Test-Path $credentialsPath)) { throw "Release credentials missing: $credentialsPath. Restore your private signing backup first." }
        $credentials = Get-Content -LiteralPath $credentialsPath -Raw | ConvertFrom-Json
        $env:DRIFT_RELEASE_STORE = Join-Path $root '.local\drift-release.p12'
        $env:DRIFT_RELEASE_PASSWORD = $credentials.password
        $env:DRIFT_RELEASE_ALIAS = $credentials.alias
        if (-not (Test-Path $env:DRIFT_RELEASE_STORE) -or -not $env:DRIFT_RELEASE_PASSWORD -or -not $env:DRIFT_RELEASE_ALIAS) {
            throw 'Release key or signing credentials are missing.'
        }
    }
    $keystore = Join-Path $root '.local\debug.keystore'
    if (-not (Test-Path $keystore)) {
        New-Item -ItemType Directory -Force (Split-Path $keystore) | Out-Null
        # These are Android's public debug credentials, never release signing keys.
        $ErrorActionPreference = 'Continue'
        & "$JdkPath\bin\keytool.exe" -genkeypair -keystore $keystore -storetype PKCS12 `
            -storepass android -keypass android -alias androiddebugkey -keyalg RSA `
            -keysize 2048 -validity 10000 -dname 'CN=Android Debug,O=Android,C=US'
        $keyExitCode = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($keyExitCode -ne 0) { throw "Debug keystore generation failed with exit code $keyExitCode." }
    }
    Push-Location (Join-Path $root 'android')
    try {
        if ($Release) { & .\gradlew.bat --no-daemon --console=plain assembleRelease lintRelease }
        else { & .\gradlew.bat --no-daemon --console=plain assembleDebug lintDebug }
        if ($LASTEXITCODE -ne 0) { throw "Android build failed with exit code $LASTEXITCODE." }
    } finally {
        Pop-Location
    }
    $variant = if ($Release) { 'release' } else { 'debug' }
    Write-Output "APK: $(Join-Path $root "android\app\build\outputs\apk\$variant\app-$variant.apk")"
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
