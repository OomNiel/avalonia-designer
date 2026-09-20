/**
 * Builds a Debian package for a designed Avalonia project.
 *
 * Everything that decides *what the package contains and promises* is a pure function here, so the
 * layout, the metadata and the install-time contract can be asserted in tests without running dpkg.
 * Only `debTree` writes anything, and only `dpkg-deb` is invoked — the caller checks for it first.
 *
 * The .NET runtime is deliberately **not** bundled (standing project rule): the package declares a
 * dependency on the matching `dotnet-runtime-<major>.0`, so apt installs the prerequisite instead of
 * the .deb carrying a private copy of it. The same applies to the native libraries Avalonia links
 * against — they are declared, not assumed.
 */

/** Where a Debian package places things. Debian policy: architecture-independent data under /usr. */
export const DEB_APP_DIR = '/usr/lib';
export const DEB_BIN_DIR = '/usr/bin';
export const DEB_ICON_DIR = '/usr/share/icons/hicolor/256x256/apps';

/**
 * A Debian package name: lowercase, only `[a-z0-9+.-]`, and it must start with an alphanumeric
 * (`dpkg-deb` refuses anything else). `My.App 2` becomes `my.app-2`.
 */
export function debPackageName(name: string): string {
    const cleaned = String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9+.-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^[^a-z0-9]+/, '')
        .replace(/[^a-z0-9]+$/, '');
    return cleaned || 'avalonia-app';
}

/**
 * A Debian version: must start with a digit, and `-` splits it into upstream/revision (a bare
 * `1.0.0-beta` would be parsed as upstream `1.0.0` + revision `beta`, which is legal but surprising),
 * so a leading `v` is dropped and any `-` becomes `.`; an empty/garbage value falls back to 1.0.0.
 */
export function debVersion(raw: string): string {
    let v = String(raw || '').trim().replace(/^v/i, '');
    v = v.replace(/-/g, '.').replace(/[^0-9A-Za-z.+~:]/g, '');
    if (!/^[0-9]/.test(v)) return '1.0.0';
    return v;
}

/** Node's `process.arch` (and `uname -m`) to the Debian architecture name. */
export function debArchitecture(arch: string): string {
    switch (String(arch || '').toLowerCase()) {
        case 'x64':
        case 'x86_64':
        case 'amd64': return 'amd64';
        case 'arm64':
        case 'aarch64': return 'arm64';
        case 'ia32':
        case 'x86':
        case 'i386': return 'i386';
        case 'arm':
        case 'armv7l': return 'armhf';
        default: return String(arch || '').toLowerCase();
    }
}

/**
 * The runtime package a framework-dependent app needs, from its target framework: `net8.0` →
 * `dotnet-runtime-8.0`. A `net8.0-windows` style TFM keeps the bare major, which is what the Debian
 * feed names.
 */
export function runtimeDependency(targetFramework: string): string | undefined {
    const m = /^net(\d+)\.(\d+)/i.exec(String(targetFramework || '').trim());
    return m ? `dotnet-runtime-${m[1]}.${m[2]}` : undefined;
}

/** Native libraries an Avalonia X11 app links against (declared so apt resolves them). */
export const AVALONIA_LINUX_LIBS = [
    'libx11-6', 'libxkbcommon0', 'libice6', 'libsm6', 'libfontconfig1', 'libgl1'
];

/** `<TargetFramework>net8.0</TargetFramework>` (or `TargetFrameworks`, first entry). */
export function targetFrameworkOf(projectText: string): string {
    const many = /<TargetFrameworks?>([^<]*)<\/TargetFrameworks?>/i.exec(projectText);
    const value = many ? many[1].split(';')[0].trim() : '';
    return value || 'net8.0';
}

/** `<Version>1.2.3</Version>` / `<VersionPrefix>`, else the fallback. */
export function appVersionOf(projectText: string, fallback = '1.0.0'): string {
    const m = /<(?:Version|VersionPrefix)>\s*([^<]+?)\s*<\/(?:Version|VersionPrefix)>/i.exec(projectText);
    return m ? decodeXmlText(m[1]) : fallback;
}

/**
 * XML text decoding for values read straight out of a project file: `<AssemblyName>A &amp; B</AssemblyName>`
 * means the name `A & B`, and a name like that must reach the package metadata (and then be escaped again
 * where it is written back out) instead of leaking `&amp;` into a .desktop file or an MSI product name.
 */
export function decodeXmlText(s: string): string {
    const entities: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
    return String(s ?? '').replace(/&(lt|gt|quot|apos|amp);/g, (_m, e) => entities[e]);
}

/** `<AssemblyName>Foo</AssemblyName>`, else the project file's own name. */
export function assemblyNameOf(projectText: string, fallback: string): string {
    const m = /<AssemblyName>\s*([^<]+?)\s*<\/AssemblyName>/i.exec(projectText);
    return m ? decodeXmlText(m[1]) : fallback;
}

export interface ControlFields {
    package: string;
    version: string;
    architecture: string;
    maintainer: string;
    /** Comma-separated; `undefined` entries are ignored. */
    depends: (string | undefined)[];
    /** Installed size in KiB. */
    installedSizeKiB: number;
    homepage?: string;
    /** One line for the menu/apt; the rest becomes the indented long description. */
    description: string;
    longDescription?: string[];
}

/**
 * The `DEBIAN/control` file. Field order follows what `dpkg-deb` writes, and the long description is
 * indented by one space with blank lines as ` .` — get that wrong and apt shows a mangled entry.
 */
export function controlFile(f: ControlFields): string {
    const depends = f.depends.filter((d): d is string => !!d && !!d.trim()).join(', ');
    const lines = [
        `Package: ${f.package}`,
        `Version: ${f.version}`,
        'Section: misc',
        'Priority: optional',
        `Architecture: ${f.architecture}`,
        `Maintainer: ${f.maintainer}`,
        ...(depends ? [`Depends: ${depends}`] : []),
        ...(f.installedSizeKiB > 0 ? [`Installed-Size: ${Math.ceil(f.installedSizeKiB)}`] : []),
        ...(f.homepage ? [`Homepage: ${f.homepage}`] : []),
        `Description: ${f.description}`
    ];
    const long = f.longDescription ?? [];
    if (long.length) {
        // The first line continues the short description; the rest is indented, and an empty line
        // inside the long description must be " ." to stay part of the same paragraph.
        lines.push(...long.map((l) => ' ' + (l.trim() ? l.trim() : '.')));
    }
    return lines.join('\n') + '\n';
}

/**
 * `usr/bin/<package>` — a shell wrapper rather than a symlink so it can fall back to the runtime when
 * the apphost is missing (e.g. someone re-published without a RID).
 */
export function launcherScript(assemblyName: string, packageName: string): string {
    return `#!/bin/sh
# Generated by Grumpy's WYSIWYG Designer — runs the app published into ${DEB_APP_DIR}/${packageName}.
APP_DIR="${DEB_APP_DIR}/${packageName}"
if [ -x "$APP_DIR/${assemblyName}" ]; then
    exec "$APP_DIR/${assemblyName}" "$@"
fi
exec /usr/bin/dotnet "$APP_DIR/${assemblyName}.dll" "$@"
`;
}

/** The application-menu entry (freedesktop). `Exec` uses the package name, which is on PATH. */
export function desktopEntry(f: { package: string; name: string; comment?: string }): string {
    return `[Desktop Entry]
Type=Application
Version=1.0
Name=${f.name}
Comment=${f.comment || f.name}
Exec=${f.package} %U
Icon=${f.package}
Terminal=false
Categories=Utility;
StartupNotify=true
`;
}

/** Refreshes the menu/icon caches after install — best effort, never fatal. */
export function postinstScript(): string {
    return `#!/bin/sh
set -e
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications 2>/dev/null || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor 2>/dev/null || true
fi
exit 0
`;
}

export interface DebTreeOptions {
    package: string;
    /** Display name in the menu entry. */
    appName: string;
    assemblyName: string;
    version: string;
    architecture: string;
    maintainer: string;
    depends: (string | undefined)[];
    installedSizeKiB: number;
    description: string;
    longDescription?: string[];
    homepage?: string;
    /** Absolute path of a PNG/SVG to install as the app icon, if the project has one. */
    iconSource?: string;
    comment?: string;
}

/** One file of the package, with the mode it must be written with. */
export interface DebFile {
    /** Path relative to the staging root, e.g. `DEBIAN/control`. */
    rel: string;
    mode: number;
    /** Generated content. Absent when the file is `copyFrom`-ed instead (a binary icon). */
    text?: string;
    /** Absolute path of a file to copy verbatim (an image the project already has). */
    copyFrom?: string;
}

/**
 * The files the designer generates into the staging tree (the published app itself is copied in by
 * the caller). `usr/bin/<pkg>` and the maintainer scripts must be executable.
 */
export function debTree(o: DebTreeOptions): DebFile[] {
    const files: DebFile[] = [
        {
            rel: 'DEBIAN/control',
            mode: 0o644,
            text: controlFile({
                package: o.package,
                version: o.version,
                architecture: o.architecture,
                maintainer: o.maintainer,
                depends: o.depends,
                installedSizeKiB: o.installedSizeKiB,
                homepage: o.homepage,
                description: o.description,
                longDescription: o.longDescription
            })
        },
        { rel: 'DEBIAN/postinst', mode: 0o755, text: postinstScript() },
        {
            rel: `usr/bin/${o.package}`,
            mode: 0o755,
            text: launcherScript(o.assemblyName, o.package)
        },
        {
            rel: `usr/share/applications/${o.package}.desktop`,
            mode: 0o644,
            text: desktopEntry({ package: o.package, name: o.appName, comment: o.comment })
        }
    ];
    if (o.iconSource) {
        const ext = o.iconSource.toLowerCase().endsWith('.svg') ? 'svg' : 'png';
        files.push({
            rel: `usr/share/icons/hicolor/256x256/apps/${o.package}.${ext}`,
            mode: 0o644,
            copyFrom: o.iconSource
        });
    }
    return files;
}

/** `dpkg-deb` arguments: `--root-owner-group` makes the package root-owned without fakeroot. */
export function dpkgDebArgs(stageDir: string, outFile: string): string[] {
    return ['--root-owner-group', '--build', stageDir, outFile];
}

/** The .deb's file name: `<package>_<version>_<arch>.deb` (the Debian convention). */
export function debFileName(packageName: string, version: string, architecture: string): string {
    return `${packageName}_${version}_${architecture}.deb`;
}
