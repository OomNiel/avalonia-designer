/**
 * Builds a Windows installer (MSI) for a designed Avalonia project, using the WiX toolset (`wix build`,
 * WiX v4/v5/v6 — the `dotnet tool install --global wix` package).
 *
 * Like `debBuilder`, everything that decides *what the installer is and does* is a pure function here:
 * the WiX source, the version/product/upgrade identity, the harvest pattern and the build arguments are
 * all strings, so they can be asserted without Windows. Only the published payload beside the source is
 * opaque to us.
 *
 * Two decisions worth stating, because they are what make an MSI behave like an installer instead of a
 * file copy:
 *  - **Per-machine into `Program Files`**, matching the Linux side's choice of a system-wide location.
 *    WiX's own guidance is to avoid `Files` harvesting in per-user packages (it fails ICE validation), and
 *    a per-machine package also gets a proper entry in *Apps & features*.
 *  - **A stable `UpgradeCode` derived from the package name**, not a fresh GUID per build. The
 *    ProductCode is what changes per version; the UpgradeCode is what ties them together, so installing a
 *    newer build *replaces* the old one (that is what makes the Install button an install/re-install).
 *
 * The .NET runtime is **not** bundled here either (standing project rule): the package declares it as a
 * requirement — the Windows equivalent of a `Depends:` line — and refuses to install with a message
 * pointing at the download when it is missing.
 */

/** XML text escaping — a form called `Tom & Jerry <Forms>` must not break the .wxs file. */
export function xmlEscape(s: string): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * An MSI ProductVersion: three numbers, major/minor ≤ 255 and build ≤ 65535 (MSI truncates beyond that,
 * and a truncated version silently breaks upgrades). Pre-release text is dropped — MSI has nowhere to put
 * it — so `1.0.0-beta` publishes as `1.0.0`.
 */
export function msiVersion(raw: string): string {
    const m = /^[vV]?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(raw || '').trim());
    if (!m) return '1.0.0';
    const clamp = (v: string | undefined, max: number) => Math.min(Number(v || 0) || 0, max);
    const major = clamp(m[1], 255);
    const minor = clamp(m[2], 255);
    const build = clamp(m[3], 65535);
    return `${major}.${minor}.${build}`;
}

/** `My App` → `My App` has to stay readable in Add/Remove Programs, but the file name must not. */
export function msiFileName(packageName: string, version: string, arch: string): string {
    return `${packageName}_${version}_${arch}.msi`;
}

/** The MSI architecture: `-arch x64` / `x86` / `arm64`. */
export function msiArchitecture(arch: string): string {
    switch (String(arch || '').toLowerCase()) {
        case 'x64':
        case 'x86_64':
        case 'amd64': return 'x64';
        case 'arm64':
        case 'aarch64': return 'arm64';
        default: return 'x86';
    }
}

/** The .NET runtime identifier for a Windows architecture (`dotnet publish -r`). */
export function winRid(msiArch: string): string {
    return `win-${msiArch === 'x86' ? 'x86' : msiArch}`;
}

/**
 * A deterministic GUID from a string (FNV-1a over two seeds), used for the UpgradeCode so every build of
 * the same app upgrades the previous one. It is not a cryptographic hash and does not need to be — it just
 * has to be stable, and to differ between different app names.
 */
export function stableGuid(seed: string): string {
    const part = (salt: string) => {
        let hash = 0x811c9dc5;
        for (const ch of salt + seed) {
            hash ^= ch.charCodeAt(0);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return hash.toString(16).padStart(8, '0');
    };
    const hex = part('a') + part('b') + part('c') + part('d');
    // Version 4 / variant 8 nibbles, so the result is a well-formed GUID string.
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The runtime the app needs, from its TFM: `net10.0` → `{ major: 10, url: … }`. */
export function dotnetRuntimeFor(targetFramework: string): { major: number; url: string } | undefined {
    const m = /^net(\d+)\.(\d+)/i.exec(String(targetFramework || '').trim());
    if (!m) return undefined;
    return { major: Number(m[1]), url: `https://dotnet.microsoft.com/download/dotnet/${m[1]}.0` };
}

export interface WixOptions {
    /** Product name shown in Add/Remove Programs. */
    appName: string;
    /** File name of the published executable (the apphost), e.g. `MyApp.exe`. */
    exeName: string;
    version: string;
    manufacturer: string;
    description: string;
    upgradeCode: string;
    /** Absolute Windows path of the published payload to harvest. */
    payloadDir: string;
    /** Absolute Windows path of a .ico for the shortcut/Add-Remove entry, if the project has one. */
    iconPath?: string;
    /** The .NET runtime major the app needs (a launch condition points at the download). */
    runtimeMajor?: number;
    runtimeUrl?: string;
}

/**
 * The WiX source. Harvesting is done by WiX itself (`<Files Include="…\**">`), so the file list does not
 * have to be known here — it only exists after `dotnet publish` has run.
 */
export function wixSource(o: WixOptions): string {
    const name = xmlEscape(o.appName);
    const dirName = xmlEscape(o.appName);
    const shortcutGuid = stableGuid('shortcut:' + o.appName);
    const componentGuid = stableGuid('component:' + o.appName);
    const icon = o.iconPath ? `\n    <Icon Id="AppIcon.ico" SourceFile="${xmlEscape(o.iconPath)}" />` +
        `\n    <Property Id="ARPPRODUCTICON" Value="AppIcon.ico" />` : '';
    const launch = o.runtimeMajor ? `    <Property Id="NETRUNTIME_PRESENT">
      <RegistrySearch Id="DotNetSharedHost" Root="HKLM"
                      Key="SOFTWARE\\dotnet\\Setup\\InstalledVersions\\x64\\sharedhost"
                      Name="Version" Type="raw" />
    </Property>
    <Launch Condition="Installed OR NETRUNTIME_PRESENT"
            Message="[ProductName] needs the .NET ${o.runtimeMajor} runtime, which is not installed. Get it from ${xmlEscape(o.runtimeUrl ?? '')} and run this installer again." />
` : '';

    return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by the Avalonia Designer. Re-runnable: see the packaging section in NOTES.md. -->
<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">
  <Package Name="${name}"
           Manufacturer="${xmlEscape(o.manufacturer)}"
           Version="${xmlEscape(o.version)}"
           UpgradeCode="${xmlEscape(o.upgradeCode)}"
           Scope="perMachine"
           Language="1033"
           Codepage="65001">
    <SummaryInformation Description="${xmlEscape(o.appName)} — ${xmlEscape(o.description)}"
                        Manufacturer="${xmlEscape(o.manufacturer)}" />${icon}
    <!-- A newer version replaces an older one (the UpgradeCode above is what links them). -->
    <MajorUpgrade DowngradeErrorMessage="A newer version of [ProductName] is already installed." />
${launch}    <StandardDirectory Id="ProgramFiles64Folder">
      <Directory Id="INSTALLFOLDER" Name="${dirName}" />
    </StandardDirectory>
    <StandardDirectory Id="ProgramMenuFolder">
      <Directory Id="AppMenuFolder" Name="${dirName}" />
    </StandardDirectory>

    <Feature Id="Main" Title="${name}" Level="1">
      <ComponentGroupRef Id="AppFiles" />
      <ComponentRef Id="StartMenuShortcut" />
    </Feature>

    <ComponentGroup Id="AppFiles" Directory="INSTALLFOLDER">
      <Files Include="${xmlEscape(o.payloadDir)}\\**" />
    </ComponentGroup>

    <Component Id="StartMenuShortcut" Directory="AppMenuFolder" Guid="${shortcutGuid}">
      <Shortcut Id="AppShortcut" Name="${name}" Target="[INSTALLFOLDER]${xmlEscape(o.exeName)}"
                WorkingDirectory="INSTALLFOLDER"${o.iconPath ? ' Icon="AppIcon.ico"' : ''} />
      <RemoveFolder Id="RemoveAppMenuFolder" On="uninstall" />
      <RegistryValue Root="HKCU" Key="Software\\${xmlEscape(o.appName)}" Name="installed"
                     Type="integer" Value="1" KeyPath="yes" />
    </Component>

    <Component Id="AppIdentity" Directory="INSTALLFOLDER" Guid="${componentGuid}">
      <RegistryValue Root="HKLM" Key="Software\\${xmlEscape(o.appName)}" Name="InstallDir"
                     Type="string" Value="[INSTALLFOLDER]" KeyPath="yes" />
    </Component>
  </Package>
</Wix>
`;
}

/** `wix build -arch x64 -o <msi> <file.wxs>` (WiX v4+ command line). */
export function wixBuildArgs(wxsFile: string, outFile: string, arch: string): string[] {
    return ['build', '-arch', arch, '-o', outFile, wxsFile];
}

/** The bundled `wix` dotnet tool is what we expect; the message says how to get it. */
export const WIX_MISSING_MESSAGE = 'The WiX toolset is missing, so the MSI cannot be built. Install it ' +
    'once with:  dotnet tool install --global wix   (then reopen the terminal so PATH is refreshed).';
