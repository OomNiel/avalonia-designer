# Publishing the extension (maintainer guide)

How to publish **Grumpy's WYSIWYG Designer for VS Code** to the Visual Studio Marketplace: create the
publisher, create the access token, store it for CI, and push a release.

> **This document is for whoever maintains the extension** — it is *not* shipped inside the VSIX
> (it is listed in `.vscodeignore`).
>
> Prerequisite: the `version`, `publisher`, `icon`, `license` and `repository` fields in
> `package.json` are what the Marketplace shows. The publisher **ID** there must match the publisher
> you register below, or `vsce publish` fails with *"not a valid publisher"*.

> ## ⚠️ The PAT route ends on 1 December 2026
>
> Azure DevOps is retiring **global** personal access tokens — precisely the *"All accessible
> organizations"* token this guide uses, because Marketplace publishing needs a token that reaches
> beyond your own organization. After **1 December 2026** those tokens stop working and a
> `VSCE_PAT`-based publish fails with a 401.
>
> Creating new global PATs is **still allowed today** (an earlier plan to block creation on
> 15 March 2026 was cancelled), so parts A–F below work right now — but plan the migration in
> **part G** before the deadline.

Reviewed **2026-09-12** against Microsoft's own sources (see *Related* for the links):

| Check | Result |
|---|---|
| Publisher ID `grumpy` on the Marketplace | free (no publisher page) |
| Extension `grumpy.avalonia-designer` | unused (0 gallery matches) |
| GitHub repository `OomNiel/avalonia-designer` | public (the listing's repository link needs that) |
| Sign-in entry points | live, but they **bounce to the Microsoft sign-in page** (that redirect is normal, not a broken link) |

---

## A. Create the publisher

1. Open <https://marketplace.visualstudio.com/manage> and sign in with the Microsoft account that
   should own the extension. A personal account is fine; a work/school account must belong to an
   Entra ID tenant. With no session active the page first redirects to the Microsoft sign-in page —
   that is normal, not a broken link.
2. Choose **Create publisher** and fill in:
   - **ID** — `grumpy` (must equal `"publisher"` in `package.json`, exactly)
   - **Name** — the display name shown on the listing (e.g. `Grumpy` or `OomNiel`)
3. Save. The optional **verified** badge needs a domain/TXT record *and* Microsoft's prerequisites — an
   extension on the Marketplace for at least **6 months**, and a domain registered at least 6 months
   ago — so it cannot be done on day one; revisit it once the listing has some history.

> Prefer a different ID? Change `"publisher"` in `package.json` to the new ID; the two must match.

## B. Create the personal access token (PAT)

A PAT is an Azure DevOps artefact, so you need a (free) Azure DevOps **organization** to create one —
it does not have to be related to the repository.

1. Sign in with the **same** account you used for the publisher. <https://app.vssps.visualstudio.com>
   is the reliable entry point (it forwards to the Microsoft sign-in page first).
2. **An organization has to exist before the token page does.** A PAT belongs to an Azure DevOps
   *organization*, so without one `dev.azure.com/<org>/_usersSettings/tokens` answers **“404 – Page not
   found”** — the signature of a missing or misspelled organization, not a broken link.
   - No organization yet? Choose **Create new organization** on the Azure DevOps start page (or follow
     [Create an organization](https://learn.microsoft.com/azure/devops/organizations/accounts/create-organization)),
     give it any name (e.g. `oomniel`) and finish the wizard. `Public` visibility is the simplest
     choice — it publishes nothing and has nothing to do with the Marketplace listing.
3. Open the token page **for that organization**, with the name you just chose in place of
   `<your-org>`: `https://dev.azure.com/<your-org>/_usersSettings/tokens`
   (or, once signed in: the gear icon, top right → **Personal access tokens**).
   Click-by-click reference:
   [Use personal access tokens](https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate).
4. Choose **New Token** and use exactly these settings:
   - **Name** — `vsce-marketplace`
   - **Organization** — **All accessible organizations** *(a single-organization token is the
     documented cause of 401/403 here: publisher data does not live in your own organization, so an
     org-scoped token cannot reach it)*
   - **Expiration** — **a date on or before 1 December 2026** (3 months is plenty). The token is
     retired with every other global PAT on that date, so a longer expiry buys nothing and only
     hides the migration behind a mystery 401 later
   - **Scopes** — **Show all scopes**, then tick **Marketplace → Manage**
     *(this is the only scope needed; neighbouring read scopes are not enough)*
5. Choose **Create** and copy the token **immediately** — it is shown only once.

> **This token has a fixed lifetime**, whatever expiry you pick: global PATs stop working on
> **1 December 2026**. Treat that date as the real expiry — it matters again in part F (rotation) and
> part G (the replacement).

> Treat the token like a password: never paste it into a chat, an issue, a commit or a file in this
> repository. If it leaks, revoke it on the same page and create a new one.

## C. Verify the token before relying on it

Cheaper than debugging a failed release run:

```bash
cd avalonia-designer-extension
npx --yes @vscode/vsce@2.15.0 verify-pat grumpy
# paste the PAT when prompted
```

Expected output: *“The Personal Access Token verification succeeded for the publisher 'grumpy'.”*

Two mistakes produce the same *“…verification has failed”* message — the scope (needs
**Marketplace → Manage**) and the organization (needs **All accessible organizations**). After
**1 December 2026** there is a third one waiting: the token type no longer exists (see part G).

## D. Store the token in GitHub (what the release workflow reads)

1. Open <https://github.com/OomNiel/avalonia-designer/settings/secrets/actions>.
2. Choose **New repository secret**.
3. **Name** — `VSCE_PAT` (exactly this; `.github/workflows/release.yml` reads `secrets.VSCE_PAT`).
4. **Secret** — paste the PAT, then **Add secret**.

GitHub secrets are write-only: the value is never shown again, and changing it means deleting and
re-adding the secret. If you would rather not keep a token in GitHub at all, skip this step and
publish from your machine (part E, second option).

## E. The first publish

> **Current practice (2026-09-13): upload through the publisher portal.** The maintainer decided to
> keep doing it by hand until the Azure DevOps PAT discontinuance is settled (part G) rather than
> create a token now, so the CLI and workflow routes below are documented but **unused** — the workflow
> will simply report “⚠ NOT PUBLISHED” (green, with a warning) if it is run without the secret.
> Upload `avalonia-designer-<version>.vsix` and submit; the portal adds it to the listing.

Either route does the same thing:

- **From GitHub** — *Actions* → **Release** → *Run workflow*. First run with **dry_run** on (it builds,
  tests and packages, but publishes nothing). Once that is green, run it again with **dry_run** off to
  publish.
- **From your machine** —
  ```bash
  VSCE_PAT=<paste-token> npm run publish:stable
  # or, once:  npx --yes @vscode/vsce@2.15.0 login grumpy   (stores it in your keychain)
  # then:      npm run publish:stable
  ```

The first publish creates the listing at
<https://marketplace.visualstudio.com/items?itemName=grumpy.avalonia-designer>, built from the
packaged `package.json` and `README.md`; it takes a few minutes to appear. `README.md` **inside the
VSIX** is what the listing's overview tab shows, so a release whose README changed only reaches the
listing when that release is uploaded — a repo-only README edit does not.

> **Status: done — first listing live 2026-09-12 as `0.9.0`.** It was uploaded through the publisher
> portal's **Upload** button, so no PAT was involved. That path works today and needs no token; the
> `VSCE_PAT` workflow below is for automating later releases. Validation completed the same day, after
> which the extension became visible inside VS Code.
>
> **`0.9.1` (2026-09-13) — LIVE.** Second listing version, tagged `v1.0.0-beta.8`. It went up through
> the publisher portal (as `0.9.0` did) after the extension was unpublished and published again — the
> gallery's `VsixSha256` matches the local `avalonia-designer-0.9.1.vsix` byte for byte, so that is the
> file that is live.
>
> ⚠ **What you upload is what the listing shows.** The identity a listing uses comes from the VSIX that
> is uploaded, and a packaged VSIX cannot be re-flagged afterwards — so check what you are about to
> upload *before* uploading it:
> `unzip -p <file> extension.vsixmanifest | grep -o 'PreRelease" Value="[a-z]*"'`
> (no match = the normal listing version).
>
> ⚠ **Always pass `--out` when you build more than one variant.** `vsce package --pre-release` alone
> **overwrites** `avalonia-designer-<version>.vsix` instead of writing a separate file, so both variants
> need an explicit name: `npm run package -- --out <name>.vsix` and
> `npm run package -- --pre-release --out <other>.vsix`. `publish:pre` exists for the rare case of
> deliberately publishing a build on the other channel; everything in `0.9.x` ships with
> `publish:stable`.
> The automated path works as soon as the secret exists. **Without it the run does not fail:** a
> preflight step notices the missing token, the job still compiles, runs the full suite, packages the
> VSIX and uploads it as an artifact, prints a `::warning::`, and its **job summary says
> \"⚠ NOT PUBLISHED\"** with the reason and the fix. That is deliberate — a red run for a known setup
> gap only produces a failure email (which it did on 2026-09-13), while a publish that is attempted and
> *fails* still fails the job, because that one is real news. The summary also distinguishes a dry run
> from a real publish, so a green run can never be mistaken for a published one.
>
> **`0.9.2` (2026-09-13) — LIVE on the Marketplace, hash-verified.** Third listing version, tagged
> `v1.0.0-beta.9`, and the first release that carries **📦 Publish** / **🚀 Install**. Built as a plain
> VSIX — `avalonia-designer-0.9.2.vsix`, sha256
> `c4ba0a02c1d03a510b86a221e80fb2d3174639bad47bc1ca6f097ff1e07870cf` — uploaded through the publisher
> portal and attached to the GitHub release with the same tag (downloaded again and compared: the
> gallery's `VsixSha256` matches the local file byte for byte). The old VSIX files were deleted from
> the project folder on purpose — one artifact per release, so the file that gets uploaded cannot be
> confused with an earlier build.
>
> **`0.9.3` (2026-09-13) — LIVE, hash-verified.** Fourth listing version, tagged `v1.0.0-beta.10`, and
> a documentation-only patch: the install instructions in `README.md`, `USER_MANUAL.md` and
> `CHANGELOG.md` no longer describe a pre-release channel, so this is the upload that put the corrected
> text on the listing's overview tab (the tab shows the `README.md` *inside* the uploaded VSIX, and
> `0.9.2` could not be re-uploaded). Plain VSIX — `avalonia-designer-0.9.3.vsix`, sha256
> `a00d6205a199d8b5285f6f9ec65e55afbd7e980cf3cc36078732ea52d6eb76ca` — uploaded through the publisher
> portal; the gallery's stored `VsixSha256` matches it byte for byte.
>
> **`0.9.4` (2026-09-14) — LIVE, hash-verified; its GitHub release is *Latest*.** Fifth listing version, tagged
> `v1.0.0-beta.11`, and the first release with the new artwork: the extension icon is the new badge
> with the black field outside its blue ring removed, and the Activity Bar glyph is a white version of
> the same badge. Both are 128x128 transparent PNGs, both keep their file names, so **the manifest is
> unchanged** (`Grumpy.png` / `GrumpyWhite.png` — same fields, new pixels). Plain VSIX —
> `avalonia-designer-0.9.4.vsix`, sha256
> `7bc26f839116b438268bd305b1c1449e2f02653f527becda70dfa85eb1506379` — and the `0.9.3` file was deleted
> once this build succeeded. **Uploaded through the publisher portal:** the gallery's stored
> `VsixSha256` equals that same hash byte for byte, and `flags: 950` (which excludes non-validated
> versions) already returned `0.9.4` when it was checked — no *Verifying* window this time, so VS Code
> could install it immediately.
>
> **GitHub `v1.0.0-beta.11` is created** with that VSIX attached; re-downloading the asset and
> `sha256sum`-ing it matched the local file, so the release carries exactly the build that is live on
> the Marketplace (as `beta.8`/`beta.9` did). Its title no longer carries the `(BETA)` suffix — from
> `beta.11` on the suffix is gone, since the release is a normal one. It is **not** marked pre-release and is flagged **Latest** —
> the first release in the repo's history that is (all nine earlier ones are pre-release), so the
> repository page now shows a normal latest release. **The tag history has a gap:** `0.9.3` went out through the
> portal without ever being tagged, so the releases run `v1.0.0-beta.9` → `v1.0.0-beta.11` — the
> `0.9.3` package can be backfilled from the gallery's stored copy if that ever matters.

> **`0.9.5` – `0.9.46` (2026-09-15 → 2026-09-16) — LOCAL BUILDS ONLY, never published; all of it is in
> `0.10.0`.** Forty-two versions of work (the AI assist's own runtime set-up, models from Hugging Face, your
> own `llama-server`, house rules, the optional Vulkan build for the built-in runtime, two rounds of
> settings-panel measurement) were built, installed and committed, and **none of them ever went to the
> Marketplace** — the feature set was still settling. `0.10.0` is the release that carries the lot, which is
> why its changelog entry is a summary of the range rather than a list of one day's changes.

> **`0.10.0` (2026-09-16) — prepared here, handed over for upload; NEVER UPLOADED (superseded by `0.10.1`).**
> Sixth listing
> version and the first under the **single-number scheme**: the GitHub tag is `v0.10.0`, the release title
> carries `v0.10.0`, and `package.json` holds `0.10.0` — tag and listing finally agree, so there is no mapping
> to explain to anyone. What went with it: the **local AI assist** became part of the listing's description
> (`package.json` → `description`, plus the keywords `ai` and `llm`), and the repository's About text says the
> same thing.
>
> **Do not upload this file.** It was prepared on 2026-09-16 and never went out; `0.10.1` (below) carries the
> same `0.10.0` content plus that day's work, and it is the release the user is uploading. If `0.10.0` ever
> matters again it is still attached to its own GitHub release.
>
> Plain VSIX — `avalonia-designer-0.10.0.vsix`, sha256
> `bf7e1519f9ef0ac8cb2fc28a9ad7fa7659e3cea91d3dc2debf76f5f259df5c74` — built by `npm run package` after a green
> suite (**4,438 assertions, 0 failed**). **The upload is done by the developer through the publisher portal**
> (part E): the CLI route needs a PAT, and the global-PAT kind is retired on 1 December 2026, so the portal is
> the durable path this project uses. After the upload, check it the usual way —
> `flags: 914` must show `0.10.0` and `Microsoft.VisualStudio.Services.VsixSha256` must equal the hash above —
> and then replace this paragraph with the verified line, exactly like the entries before it.

> **`0.12.0` (2026-09-25) — released on GitHub (*Latest*, `draft=false`, `prerelease=false`); **THIS is the
> file to upload to the Marketplace.**
>
> **Corrected baseline:** the stable listing carries **`0.11.0`**, not `0.11.15` — read back from the gallery
> on 2026-09-25 (`0.11.0`, last updated 2026-09-20; `vsce show` lists the same four: `0.11.0`, `0.10.10`,
> `0.10.2`, `0.9.0`). **Nothing between `0.11.1` and `0.11.19` ever reached the listing**, so the earlier
> "brings the listing up from `0.11.15`" lines in the entries below are wrong — this one upload spans the
> whole `0.11` chart line (bar/area/pie, the waterfall and the 3D surface, cursors, the Data Selector, the
> height ramp, `ZoomX`/`ZoomY` with four packed legend sliders, the *Legend* menu entry, whole-page loading),
> the install size (583 MB → ~24 MB per copy) and hardcopy output.
>
> **Artefact:** `avalonia-designer-0.12.0.vsix`, **1,243,932 bytes**, sha256
> **`7817b7c33051aaaf97a99d8a36a581dd6bfe9d6c1e540da70e0c071b482e46b6`**, **118 files** (0 source maps),
> manifest `Version="0.12.0"` and **no `PreRelease` attribute** (a plain, stable upload). Commit
> **`69ac3f2`** on `main`, annotated tag **`v0.12.0`** (`69ac3f2` too), pushed. Release URL:
> <https://github.com/OomNiel/avalonia-designer/releases/tag/v0.12.0> — the attached asset was downloaded
> again and `cmp`-ed against the local file: **byte-identical**. **Verified:** local `sha256sum`; the packaged
> `resources/GrumpyCharts.cs` opens with `// BUNDLED-COPY: 0.12.0`; the packaged `host/PreviewerHost.csproj`
> carries `NETCoreSdkPortableRuntimeIdentifier` and `AppendRuntimeIdentifierToOutputPath`; and the packaged
> `README.md` links the collage as
> `https://github.com/OomNiel/avalonia-designer/raw/HEAD/DesignerDemo.png` — which is why `DesignerDemo.png`
> is committed and pushed: the gallery fetches it from the repository, and the file is deliberately **not**
> in the VSIX. Suite **8,121 passed / 0 failed**; the host, all 10 generated projects (C#/VB) and the new
> print-symbol probe build 0 warnings / 0 errors.
>
> **What it changes:** hardcopy output for the charts — **Print…** (the platform's own dialog,
> Avae.Printables 3.0.7) and **Print to PDF…** (AvaloniaUI.PrintToPDF 0.6.0, Skia vector output, no printer
> needed) on the right-click menu of **all seven** chart types, including the cursor-less pie and bar, behind
> `PRINT_SUPPORT`. Newly generated projects — C# and VB — reference both packages, define the symbol and call
> `AppBuilder.UsePrintables()`; older projects compile unchanged and opt in by hand (`USER_MANUAL` §19.14).
> **The VB half of that feature did not exist before this release:** the symbol was set from a
> `BeforeTargets="VbcCompile"` target, which the SDK overwrites afterwards, so every VB project built green
> with the block compiled out. It is a comma token in `DefineConstants` now (vbc's `/define:` takes commas;
> the C# semicolon form is `BC31030`) and the guard is a build that references the gated members
> (`tests/t0-build/printsupport.test.js`). The README also gained its at-a-glance collage, and the chart help
> panel says where the two entries appear.
>
> **Upload:** publisher portal → *Update* → `avalonia-designer-0.12.0.vsix` → leave **Pre-release
> unchecked** → then confirm with the gallery query below that the version is `0.12.0` and
> `Microsoft.VisualStudio.Services.VsixSha256` equals the hash above. **The upload is the last step and it is
> the user's.**

```bash
# What the STABLE listing carries right now — run before the upload (0.11.0 on 2026-09-25) and again
# after it (must print 0.12.0 and the hash above). Flag 16 adds the version properties, 2 the files.
curl -s -X POST 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery' \
  -H 'Accept: application/json;api-version=7.2-preview.1' -H 'Content-Type: application/json' \
  -d '{"filters":[{"criteria":[{"filterType":7,"value":"grumpy.avalonia-designer"}]}],"flags":914}' \
  | python3 -c "import json,sys; e=json.load(sys.stdin)['results'][0]['extensions'][0]; \
v=e['versions'][0]; p={x['key']:x['value'] for x in v.get('properties',[])}; \
print(v['version'], v['lastUpdated'], p.get('Microsoft.VisualStudio.Services.VsixSha256'))"
```

> **`0.11.19` (2026-09-24) — GitHub release only; **SUPERSEDED by `0.12.0` — do not upload this file.** It
> brought the chart work of `0.11.16` → `0.11.19` with it: the 3D surface's height ramp (a per-band gradient
> mixed the height with the depth), the missing crest at the top of the ramp, the off-screen colour palette,
> `ZoomX`/`ZoomY` with four packed legend sliders, **Legend on/off** in the chart's right-click menu,
> whole-page loading through the new `sheetShape` host verb, the stale-bundled-copy fix, and the install size.
>
> **Artefact:** `avalonia-designer-0.11.19.vsix`, **1,235,670 bytes**, sha256
> **`11909e2a2b56bdab1930958f4902afd49eca27799628bf887ead320914c3a065`**, **118 files** (0 source maps),
> manifest `Version="0.11.19"` and **no `PreRelease` attribute** (a plain, stable upload). Commit
> **`354223a`** on `main`, annotated tag **`v0.11.19`**, pushed. Release URL:
> <https://github.com/OomNiel/avalonia-designer/releases/tag/v0.11.19>. **Verified:** local `sha256sum`, and
> the package's own contents read back out of the VSIX — the packaged `resources/GrumpyCharts.cs` opens with
> `// BUNDLED-COPY: 0.11.19`, and the packaged `host/PreviewerHost.csproj` carries
> `NETCoreSdkPortableRuntimeIdentifier` and `AppendRuntimeIdentifierToOutputPath`. Suite **8,100 passed /
> 0 failed**; T1 (402) drives the real *trimmed* host through Skia, HarfBuzz and SQLite; the host, a generated
> C# project and the VB matrix all 0 warnings / 0 errors.
>
> **What it changes:** the previewer host now builds for **one** platform — the SDK's portable RID, resolved at
> build time on the machine that will run it — instead of twenty-six. `host/bin` went **578 MB → 24 MB**
> (569 MB was `runtimes/**`, 304 MB of it `.pdb`), so a fresh install is ~24 MB rather than 583 MB;
> `SelfContained=false` keeps the runtime behaviour identical and
> `AppendRuntimeIdentifierToOutputPath=false` keeps the output in the folder the extension launches from (a RID
> would move it there and the spawn fails — that is how it was found). A `-r win-x64` cross-build produces the
> same 24 MB with `PreviewerHost.exe` and the Windows natives; the managed code is untouched. **On this
> machine** the six accumulated installed copies were pruned from 3.5 GB to 29 MB, verified by rendering a
> chart through the pruned host.
>
> **Do not upload this file — `0.12.0` supersedes it.** `0.11.16` and `0.11.17` were never released,
> `0.11.18` is GitHub-only, and the listing was still on `0.11.0` throughout, so nothing was missed by
> skipping it.

> **`0.11.18` (2026-09-24) — released on GitHub (*Latest*, `draft=false`, `prerelease=false`); the file for
> the Marketplace upload. THIS is the file to upload.**
>
> **Artefact:** `avalonia-designer-0.11.18.vsix`, **1,232,723 bytes**, sha256
> **`1bb7fcaf3f06a2508b5c97d9b40d742a92aff1f7c10cf397d4d4fa46ee045a23`**, **118 files** (0 source maps),
> manifest `Version="0.11.18"` and **no `PreRelease` attribute** (a plain, stable upload). Commit
> **`58100a9`** on `main`, annotated tag **`v0.11.18`**, pushed. Release URL:
> <https://github.com/OomNiel/avalonia-designer/releases/tag/v0.11.18>. **Verified:** local `sha256sum`, and
> the package's own contents read back out of the VSIX (**the packaged `resources/GrumpyCharts.cs` opens with
> `// BUNDLED-COPY: 0.11.18`**, and `out/bundledComponents.js` carries the content rule). Suite **8,092
> passed / 0 failed**; the host, a generated C# project and the VB matrix all 0 warnings / 0 errors.
>
> **What it changes:** the 3D surface's **height ramp is cut on the height's own levels** — a per-band
> gradient mixed the height with the depth, so a flat plate spanned 0.66…0.97 of the ramp at elevation 31 —
> and the triangle **at the ramp's maximum is filled again** (the *"open crests"* report: 0 → 9,482 sheet
> pixels at value 25 of a 0…25 scale). The **colour palette stays on screen**; **`ZoomX`/`ZoomY`** (1…100 %
> of the fitted size, ranges untouched) arrive with **two more legend sliders**, the four packed 26px apart;
> the chart's right-click menu gained **Legend on/off**; and pointing a 3D chart at a page **loads the whole
> dataset** (new host verb `sheetShape`: one series per data column, a stale slice window cleared, the width
> window left alone).
>
> **Housekeeping — the stale-copy class is closed.** Every bundled resource now carries
> `BUNDLED-COPY: <version>` in its header and "older" is decided by **comparing contents with the copy the
> extension ships**, because a *drawing* change adds no marker token to look for — that is exactly how
> `0.11.18`'s new sliders reached the designer preview while a running app still had two
> (*"the new sliders is rendering in the designer preview but not during runtime"*).
> `avaloniaDesigner.bundled.autoUpdate` (off by default) makes the refresh silent instead of asking, and the
> staleness marker moved `CutToLevels` → `legendItem` for the projects that predate the content rule.
>
> **Upload:** publisher portal → *Update* → `avalonia-designer-0.11.18.vsix` → leave **Pre-release
> unchecked** → then confirm with `flags: 914` that the version is `0.11.18` and
> `Microsoft.VisualStudio.Services.VsixSha256` equals the hash above. **The upload is the last step and it is
> the user's.** `0.11.17` and `0.11.16` were packaged but never released (their numbers are spent);
> `0.11.15` is superseded by this file.

> **`0.11.15` (2026-09-24) — released on GitHub (*Latest*, `draft=false`, `prerelease=false`); the file for
> the Marketplace upload. THIS is the file to upload.**
>
> **Artefact:** `avalonia-designer-0.11.15.vsix`, **1,212,493 bytes**, sha256
> **`e7f2e6bbb27fceed84d78d8745a2776a44ec41513bf0a125874f4b71075f1ee0`**, **118 files** (0 source maps),
> manifest `Version="0.11.15"` and **no `PreRelease` attribute** (a plain, stable upload). Commit
> **`4024d5`** on `main`, annotated tag **`v0.11.15`**, pushed. **Verified:** local `sha256sum`, and the
> package's own contents read back out of the VSIX (the packaged `resources/GrumpyCharts.cs` and `.vb` each
> carry `CutToWindow` **4×**, and `out/bundledComponents.js` carries the new marker). Suite **7,941 passed /
> 0 failed**; the host, a generated C# project and the VB matrix all 0 warnings / 0 errors.
>
> **What it fixes:** dragging the X window in a **running app** grew two false panels at either end of the
> surface sheet — the width window **clamped**, so every sample outside it was drawn *at* its edge and the
> band fill between two slices became a flat slab there. The samples are now **cut** to the window
> (`CutToWindow`, with the window's own edges interpolated), the height window keeps its documented flattening,
> and the **staleness marker moved to `CutToWindow`** so a project holding the `0.11.14` chart is offered
> **Update now**. Measured: with no window the render is pixel-identical to the pre-fix build (0 of 128,800
> pixels), and the new regression needs no reference image — the same window over two datasets differing only
> *outside* it must be pixel-identical, with the no-window pair as the control that can fail.
>
> **Upload:** publisher portal → *Update* → `avalonia-designer-0.11.15.vsix` → leave **Pre-release
> unchecked** → then confirm with `flags: 914` that the version is `0.11.15` and
> `Microsoft.VisualStudio.Services.VsixSha256` equals the hash above. **The upload is the last step and it is
> the user's.** `0.11.14` — released the same day — is superseded by this file; installing it replaces the
> older folder on the next window reload.

> **`0.11.14` (2026-09-24) — released on GitHub (*Latest* that morning); then the file for the Marketplace
> upload, now superseded by `0.11.15` (its number is spent).**
>
> **Artefact:** `avalonia-designer-0.11.14.vsix`, **1,208,318 bytes** (1.15 MB — back from 5.29 MB, see the
> housekeeping note below), sha256
> **`17d3f81b35679b6684329bae9e0f928221d2569bebf0e3d8828d0910a1c24ce6`**, **118 files** (0 source maps),
> manifest `Version="0.11.14"` and **no `PreRelease` attribute** (a plain, stable upload). Commit
> **`4b4490a`** on `main`, annotated tag **`v0.11.14`**, pushed. **Verified:** local `sha256sum`, the
> package's own contents read back out of the VSIX (the packaged `resources/GrumpyCharts.cs` carries
> `BandTriangle` **4×** and **0** crossing scans; `out/bundledComponents.js` carries the new marker; the
> packaged manifest says `0.11.14`, a plain `https://github.com/…` repository URL and no `xlsx`
> dependency), and the file is installed locally as `grumpy.avalonia-designer@0.11.14`. Suite **7,931
> passed / 0 failed**; the host, a generated C# project and the VB matrix all 0 warnings / 0 errors.
>
> **What it adds:** the **surface chart 3D** (`charts:GrumpySurfacePlot`, the seventh type) — one
> spreadsheet **column per slice** along the sheet's length over a shared X column, the Z of a slice from
> `Z Row` or `Z Start`/`Z Step`, `GridMesh`/`GridMeshSolid`/`Solid` styles, `Sampleset` or a **Temperature**
> ramp with `Heat Min`/`Heat Max`, the mesh rows, the view (`Elevation`/`Azimuth`/`Z Spacing`/`Zoom`, drag to
> turn), `Show Base`/`Base Colour`, and a **range-window legend** whose second slider counts the slices on
> show; both twins, toolbox, Properties, help text and the designer preview.
>
> **What it fixes:** the reported see-through surface — a band was filled as **one closed figure**, and a
> figure whose outline crosses itself has two loops wound opposite ways, so `NonZero` summed them to zero,
> dropped the fill and let the plot's own backcolour show through. Bands are now **one triangle pair per
> sample pair** (`BandTriangle`); on the user's own form the picture is pixel-identical to the previous code
> with the fold filled (measured: 4,291px of backcolour that used to show through). The **other half** of the
> bug was that the app compiles the *project's* copy of the chart and the staleness marker was still a token
> that copy had, so no refresh was ever offered — the **marker moved to `BandTriangle`**, and this is the
> first release that offers it. An **unused O(n²) crossing scan** went too (computed and never used: 966 ms
> → 42 ms per render on a 6 × 2048-point sheet), and two assertions that were measuring the wrong thing were
> corrected (the slice-window sheet-pixel count; the repository URL npm had rewritten).
>
> **Housekeeping:** the unused `xlsx` npm dependency is gone (nothing imports it — the chart's workbook
> reader is C#), which is what takes the VSIX from **5.29 MB** back to **1.15 MB**; the `0.11.13` development
> number was never built for release and its number is spent.
>
> **Upload:** publisher portal → *Update* → `avalonia-designer-0.11.14.vsix` → leave **Pre-release
> unchecked** → then confirm with `flags: 914` that the version is `0.11.14` and
> `Microsoft.VisualStudio.Services.VsixSha256` equals the hash above. **The upload is the last step and it
> is the user's.** Local installs of `0.11.12`/`0.11.13` are superseded by this file (VS Code prunes the
> older folder on the next window reload).

> **`0.11.12` (2026-09-23) — released on GitHub (*Latest*, `draft=false`, `prerelease=false`); then the file
> for the Marketplace upload, now superseded by `0.11.14` (its number is spent).**
>
> **Artefact:** `avalonia-designer-0.11.12.vsix`, **1,159,385 bytes**, sha256
> **`c7405e6cabe99d39a865da7c4ca9c4aaef36587e6a6a759922c28df2c83fce4d`**, 118 files (0 source maps),
> manifest `Version="0.11.12"` and **no `PreRelease` attribute** (a plain, stable upload). Commit
> **`3b431c9`** on `main`, annotated tag **`v0.11.12`**, pushed (`c788cc9..3b431c9 main`). **Verified:** local
> `sha256sum` and the GitHub release asset (`avalonia-designer-0.11.12.vsix`, the only asset on the release).
> Suite **7,549 passed / 0 failed** (and the same with `AVALONIA_COMPLIANCE_RESET=1`); host, C# probe and VB
> probe 0 warnings / 0 errors.
>
> **What it adds:** the **waterfall** chart (`charts:GrumpyWaterfallPlot`, the sixth type) — one spreadsheet
> column per **sampleset**, stood behind the next and joined by a mesh, with its own projector
> (`Elevation`, `Azimuth`, `Z Spacing`, `Zoom`, drag to turn), `Ribbon`/`Translucent`/`Lines` styles,
> `Sampleset`/`Value`/`Split` colour modes, the connector mesh rows, `MaxPoints` thinning on one stride for
> every set, no cursors by design, and a **Z Column** row per series in the Series editor. The **filled
> surface between the sets** (`SurfaceFill` / `SurfaceToFloor` and everything that followed) was built on
> 2026-09-22 and **removed again by hand before this release**, so it is not in the file and those four
> attributes do not exist on the control. Docs ride inside: `CHANGELOG` `[0.11.12]`, `README` §7,
> `USER_MANUAL` §19.12, `CONTROLS.md`, `TEST_PLAN.md`.
>
> **Upload:** publisher portal → *Update* → `avalonia-designer-0.11.12.vsix` → leave **Pre-release
> unchecked** → then confirm with `flags: 914` that the version is `0.11.12` and
> `Microsoft.VisualStudio.Services.VsixSha256` equals the hash above. **The upload is the last step and it
> is the user's.** Locally the same file is installed as `grumpy.avalonia-designer@0.11.12` (the old
> `0.11.11` folder is pruned by VS Code on the next window reload), and the preview host was rebuilt inside
> it (`dotnet build host/PreviewerHost.csproj`, 0 warnings / 0 errors).
>
> **`0.11.11` (2026-09-21) — released on GitHub (*Latest*, `draft=false`, `prerelease=false`); then the file
> for the Marketplace upload, now superseded by `0.11.12`.** It carries everything in `0.11.3` … `0.11.10`, whose
> numbers are spent (all were built and installed on this machine during the day and are superseded).
>
> **Artefact:** `avalonia-designer-0.11.11.vsix`, **1,110,164 bytes**, sha256
> **`0025867f9a8bb9ac3d6eab8e4291de0194584c02902f8bb160f73005dd2af0d0`**, 118 files, manifest
> `Version="0.11.11"` and **no `PreRelease` attribute** (a plain, stable upload). Commit **`142cde1`** on
> `main`, annotated tag **`v0.11.11`**, pushed (`ccbf597..142cde1 main`). **Verified three ways:** local
> `sha256sum`, a fresh `gh release download -R OomNiel/avalonia-designer`, and the API asset `digest` — all
> identical. Suite **6,946 passed / 0 failed**.
>
> **What it adds:** the **Bar**, **Area** and **Pie** chart controls (with the pie's **Slices** editor and
> category names read from the spreadsheet's X column), the **Data Selector** editor (source
> `Spreadsheet`/`Data Files`, the workbook, and the **page** by the workbook's own sheet names via
> `SourceSheet`/`SourceKind`/`DataFile`), and the fixes that came with them — axis colours now show in the
> designer preview (`Nullable<Color>` was skipped by the host's converter), a stale bundled helper is
> offered on **open** (`Update now`), the code check no longer calls a chart's axis **title** an invalid
> control name, and the Data Selector's dropdown renders **Spreadsheet**/**Data Files** instead of the
> letters "p" and "a". The `GrumpyCharts` staleness marker is now **`SourceSheet`**.
>
> **Upload:** publisher portal → *Update* → `avalonia-designer-0.11.11.vsix` → leave **Pre-release
> unchecked** → then confirm with `flags: 914` that the version is `0.11.11` and
> `Microsoft.VisualStudio.Services.VsixSha256` equals the hash above. **The upload is the last step and it
> is the user's.** Locally the same file is installed as `grumpy.avalonia-designer@0.11.11` — and because
> installing over the same version REPLACES the folder, the preview host had to be rebuilt inside it
> (`dotnet build host/PreviewerHost.csproj`, 0 warnings / 0 errors).
>
> **Artefact audit (run BEFORE tagging this time):** the extracted VSIX is clean of development-machine
> references — no user name, no project folder, no `/home/<user>/…` path. The only hits are the generic
> placeholders in comments (`/home/x/a.gguf`, `/home/me/data.xlsx`) and the CHANGELOG's deliberately kept
> verbatim user quote. Two paths **I** had just written into the new manual/CHANGELOG text were caught and
> neutralised (`TestExtApps/GrumpyCharts.xlsx`), which is why the shipped hash is the third build of the
> same version — the first two were never tagged or uploaded.
>
> **`0.11.2` (2026-09-21) — released on GitHub (*Latest*); superseded as an upload candidate by `0.11.11`.** Four chart appearance
> requests: the cursor readout is now **always white on black** (its border and series line still take the
> selected series' colour), the axis editor's single colour row became **three** (line, tick labels, name —
> either text colour empty follows the line), the chart gained a **Background Gradient** (`PlotBackBrush`:
> Real `LinearGradientBrush` / `RadialGradientBrush` / `ConicGradientBrush` XAML with three stops and an angle
> for the linear kind), and the spreadsheet picker **moved into the chart's right-click menu** with its **Browse
> Button row removed** from the Properties list (`ShowBrowse` survives as a documented no-op so older forms keep
> compiling). **The bug of the release, found by the new pixel test:** the preview renders through the host's
> *programmatic builder*, which had never read a brush property element — and `Brush.Parse` returns an
> **immutable** brush that a `Brush`-typed property refuses, an exception the builder swallowed per property, so
> **every `Brush`-typed attribute had silently kept its default in the preview** since long before this version.
> The `GrumpyCharts` staleness marker moved to `PlotBackBrush` (the first time it guards against XAML an old copy
> cannot even *resolve*). Suite **6,437 assertions, 0 failed** (**6,484** with `AVALONIA_COMPLIANCE_RESET=1` —
> the T5 audit re-verifies both charts' whole property list). Docs ride inside: `CHANGELOG` `[0.11.2]` (+ the
> `0.11.1` entry's "…"-button sentence annotated as since-moved), `README`, `USER_MANUAL` §19.2/19.4/19.7/19.8,
> `CONTROLS`.
>
> Plain VSIX — `avalonia-designer-0.11.2.vsix`, **1,059,485 bytes**, sha256
> `9b79c5a158563341110c2ddc3c8398ed58f0d3f4efedf15e1f6e96a2083c1615` — built by `npm run package` (**117
> files**, no source maps) *after* the docs pass, so the documentation inside it is current (that ordering is
> why the hash is written here after packaging, not before). Manifest `Version="0.11.2"`, extension id
> unchanged (`grumpy.avalonia-designer`) and **no `PreRelease` attribute** — the upload goes out on the normal
> channel.
>
> **`0.11.1` (2026-09-20) — released on GitHub (*Latest*); never uploaded — superseded by `0.11.2` above.**
> Two small requests made at the end of the `0.11.0` session: **`Padding`** on a chart (a
> `Thickness`: the room between the chart's border and everything it draws inside it — the title, the legend bar
> and the plot area with its axis furniture. The border itself does not move and the chart's backcolour still
> reaches it, so the band is chart, not form; `LegendMargin` is its sibling one level in) and the **Series
> editor's spinner fields** — Line Thickness and Marker Size rendered 204 px wide with their right edge 35 px
> past every other field, because a number input's automatic minimum size (spinner included) beat the 64 px
> flex basis; they now share the text/select rule and end flush at 169 px. The `GrumpyCharts` staleness marker
> moved to `Padding`, because a new *attribute* is as invisible to an old project copy as a new type is.
> Suite **6,306 assertions, 0 failed** (**6,308** with `AVALONIA_COMPLIANCE_RESET=1` — the T5 audit skips a
> control it has already verified). Docs ride inside: `CHANGELOG` `[0.11.1]`, `README` (three stale `0.10.11`
> claims that the `0.11.0` docs pass had missed), `USER_MANUAL` §19.7, `CONTROLS`, `TEST_PLAN`, `NOTES` §143.
>
> Plain VSIX — `avalonia-designer-0.11.1.vsix`, **1,050,403 bytes**, sha256
> `819f0cee3351ce25a4c324c11631ce01379d2d2750e4fc5a97a31707cbc042ec` — built by `npm run package` (**117
> files**) *after* the docs pass. Manifest `Version="0.11.1"`, extension id unchanged
> (`grumpy.avalonia-designer`) and **no `PreRelease` attribute** — the upload goes out on the normal channel.
>
> **`0.11.0` (2026-09-20) — released on GitHub and marked *Latest*; uploaded to the Marketplace and verified
> live** (version `0.11.0`, `preRelease: false` and `Microsoft.VisualStudio.Services.VsixSha256` = `3d913e3d…`,
> the same bytes as the released asset; the listing shows the new name). Supersedes
> `0.10.11` (released on GitHub the same day, never uploaded) and everything before it. It carries the whole
> charting tool, the nine Toolbox controls and the AI assist — **plus the documentation the released `0.10.11`
> was missing** (the cursor chapter, `CONTROLS.md`, `README.md` §7 and the new PayPal donation link at the top
> of the README, which the Marketplace listing renders as well). Code changes since `0.10.11`: a following
> chart cursor is drawn in the traced series' colour, the `GrumpyCharts` staleness marker moved to
> `DrawnColor` so old project copies are refreshed on save, and the help text says so — `NOTES.md` §142.
> Suite **6,178 assertions, 0 failed**.
>
> Plain VSIX — `avalonia-designer-0.11.0.vsix`, **1,046,409 bytes**, sha256
> `3d913e3df7c97fd2970320fbbbab2579865344b44807fb46d139e77f95ab517c` — built by `npm run package` (**117 files**)
> after the docs pass and the version bump in `package.json`, and **repackaged the same day after the rename**
> (a first build of 1,045,148 bytes / `64e0f13f…` exists in this file's history and is superseded — nothing was
> uploaded, so the number was not spent on it). Manifest now carries **`displayName` "Grumpy's WYSIWYG Designer
> for VS Code"** with the **extension id unchanged** (`grumpy.avalonia-designer`, which is what keeps settings,
> shortcuts and the 4.4 GB of downloaded models working), `Version="0.11.0"` and **no `PreRelease` attribute**.
> Audited twice by unpacking the package and grepping it: the leak check (user name, host name, `/home/…`,
> `/tmp/…`, server alias, local project names) found **one** hit in the first build — the name of a local test
> project inside a comment of the *compiled* `out/bundledComponents.js`, added that day — which was reworded,
> recompiled and repackaged; the audit of this file is **clean**, and the only "Avalonia Designer" left inside
> the package is the three deliberate ones: the generated-file marker in `out/dataSetEditor.js` (the recogniser
> that accepts files written before the rename), the README's single *"Formerly …"* line, and the `CHANGELOG`'s
> history plus its rename note.
>
> **Released on GitHub and marked *Latest*:** tag `v0.11.0` → commit **`036a8a4`**, pushed (the annotated tag
> object is `e7cc634`). The release was created with `--latest` and the asset attached — `draft=false`,
> `prerelease=false`, title *Grumpy's WYSIWYG Designer for VS Code v0.11.0*, `gh release list` shows it as the
> repository's **Latest** — and verified **three ways**: the local build, a fresh `gh release download`, and the
> API's own `digest`, all `3d913e3df7c97fd2970320fbbbab2579865344b44807fb46d139e77f95ab517c`, **1,046,409
> bytes**. Installed locally as `grumpy.avalonia-designer@0.11.0`.
>
> **PUBLISHED to the Marketplace on 2026-09-20.** Verified the same evening through the listing index:
> `Grumpy.avalonia-designer`, name **"Grumpy's WYSIWYG Designer for VS Code"**, version **`0.11.0`**,
> **`preRelease: false`** — the stable channel, which matters: `0.9.0` went out as a pre-release once by
> accident, and a pre-release would *not* change the stable listing's name — and published sha256
> **`3d913e3df7c97fd2970320fbbbab2579865344b44807fb46d139e77f95ab517c`**, i.e. byte for byte the artefact that
> was tagged, released on GitHub and audited here. The **ID is unchanged**, so the existing installs (20 at the
> time of writing) carry over and update normally — the rename arrived as an ordinary update, not as a new
> listing.
>
> **"Published" and "served" are two different moments (learned the same evening).** The Marketplace *search*
> endpoint (`filterType: 10`) showed `0.11.0` with the new name minutes after the upload was accepted, while
> the **by-ID** endpoint VS Code uses for the Extensions view (`filterType: 7` with `IncludeLatestVersionOnly`)
> **kept serving `0.10.10` and the old name** until its cache expired. A **Verifying** state in the portal is
> the same gap seen from the other side. So: check both before concluding an upload failed, and expect the
> Extensions view header to flip on its own (a window reload after that shows it) — nothing local can hurry it.
>
> **Why the Extensions view showed the OLD name before that upload (asked 2026-09-20).** VS Code merges the
> installed package with the *gallery* metadata: the row and detail **header** show the **listing's**
> `displayName`, next to the listing's own download count and rating (19 installs, 4 stars), while the DETAILS
> tab renders the README **from the installed VSIX** — which already carries the donation link and the
> *"Formerly …"* line. So the header changes **only when `0.11.0` is uploaded**; nothing local can force it, and
> a window reload, a reinstall and a machine reboot all leave it exactly there (all three were tried, in that
> order), until the upload landed. The local copy being *newer* than the listing was also why the row offered no
> **Update** button. The listing was checked the same way the release assets are: a `extensionquery` POST with
> `filterType: 7` and `flags: 914` — before the upload it returned *Grumpy.avalonia-designer*, name *Avalonia
> Designer for VS Code*, version `0.10.10`, 19 installs; the search endpoint with `filterType: 10` returns the
> version currently being accepted, which is how `0.11.0` was confirmed while the by-ID call still lagged.
>
> **Still on disk, both superseded by the above:** `avalonia-designer-0.10.11.vsix` (1,035,659 bytes,
> `20cfa4ce…`, the released one — its docs predate the cursor chapter) and `avalonia-designer-0.10.10.vsix`
> (905,176 bytes, `ec4acc0e…`, frozen). Neither is a candidate for the upload any more; delete them once
> `0.11.0` has gone out, if the one-artefact-per-release rule is to be restored.

> **`0.10.11` (2026-09-18 → released 2026-09-20) — built, installed, audited; released on GitHub, not yet uploaded.**
> Three fixes, all from the same day's reports. (1) The prompt for the AI assist is now typed **in the editor, at
> the caret**, between two marker comments, sent by a code lens (`Ctrl+Alt+Enter`) or cancelled by the other one —
> see `NOTES.md` §136; neither half of the request was possible with `showInputBox` (single-line, pinned to the top
> of the window) and the Comments API has no readable reply input, so the editor *is* the input. `USER_MANUAL.md`
> also opens with the AI-generated / work-in-progress note asked for that morning. (2) **"When the code-behind is
> saved"** (and *while typing*) could never fire — the check required the designer panel to be visible while you
> are in the code editor — so it now runs from wherever the trigger came from, publishes to PROBLEMS and announces
> a save in the status bar; `codeCheck.mode`/`codeCheck.badges` are written where the value already lives.
> (3) **The 30B step-up did nothing**: the escalation worked and then the repair loop cancelled itself on
> `!panel.visible`, because the modal is answered from wherever the user is looking. That run now ignores
> visibility, a cancel is logged, a throw is caught *and* shown, and the result reaches the status bar — see §137.
> (4) Added the same day: **nine Toolbox controls** (`ProgressBar`, `Slider`, `Separator`, `MaskedTextBox`,
> `NumericUpDown`, `PathIcon`, `ToggleSwitch`, `Polyline`, `Polygon`, each with its Properties rows); a check
> rule for an **unguarded directory listing** — the exception a build cannot see (§140); and one copy of the
> shared DataSet runtime helpers per project (two DataSets in one namespace used to break the build with
> CS0101). The dataset→TreeView binding was built, judged impractical and **removed before release** — it
> never shipped, and the TreeView control itself is untouched.
> (4) **That report came back — *"No change. The Code Fix does not start the ai train, and the 30B does
> nothing."*** — because the offer was made from the *analyser* while the AI fallback sat behind
> `if (!form) return 'no-fix';` in `fixCompilerError`: a file that is not an open form's code-behind was never
> sent to the model at all (the user's own clue — *"the ai assist is working if i prompt it"* — ruled out the
> model, server and client). The gate is gone, so the rules are a bonus when a form is found rather than a
> precondition for asking. The step-up was meanwhile working **silently** and without end: every step now goes
> to `logs/ai.log` *and* the status bar, a five-minute deadline reports that the 30B did not make it, and the
> run's outcome is logged — see §138. The extension removals the same afternoon were **not** the cause (the
> log's last Code Fix escalation is 12:48; the removals were ~14:00).
> (5) **Then the Toolbox work:** **TreeView** (five touchpoints, four of them silent when forgotten),
> the **Tree Items** node editor built on the four decisions asked for up front, and **📄 View Log** in the
> File group. Plus: the `;` rule places the semicolon at the compiler's own column and falls through to the
> model when it cannot act; the 30B step-up hands the 7B back; and the log is clamped by trimming the oldest
> lines instead of deleting the whole file — see `NOTES.md` §139.
> (6) **Then the charting tool (2026-09-20):** the bundled `GrumpyCharts` control set — a **Line Plot** and
> an **X, Y Plot**, both self-drawing, fed by an `.xlsx` workbook (or typed-in values) that is re-read on
> save — with a **Series**, an **Axis** and a **Legend** editor, a legend bar whose entries switch traces on
> and off, and up to **two draggable cursors** with a value readout, *follow trace*, arrow-key stepping and a
> `ΔX`/`ΔY` row once both are on. Plus the fix that made a workbook Excel has open readable
> (`FileShare.ReadWrite`, four retries at 120 ms, three classified messages), the host's named-colour bug
> (`"White"` was parsed as `#White` and silently became **transparent**), the `ChartCursor` staleness marker
> that refreshes a project's older bundled file on save, and the single `SelectedTrace` that stopped a
> cursor's crossing and its readout disagreeing — see §141. **This is the build that was released**
> (1,035,659 bytes, `20cfa4ce…`); the artefact packaged before the charts (935,035 bytes, `c1d8edd0…`) is
> recorded as superseded below.
>
> Plain VSIX — `avalonia-designer-0.10.11.vsix`, **1,035,659 bytes**, sha256
> `20cfa4cedcd0c1e4c33770a0fb11e24c9e2833974a488c1c57e0c1958e64fbb9` — the **released** build of `0.10.11`,
> built by `npm run package` after a green suite (**6,153 assertions, 0 failed**) and audited **twice**: once
> before tagging, where the grep found the project name `OptimisedCSTest` in a comment of the *compiled*
> `out/dataSetGenerator.js` (the same class of leak as `0.10.9`) — scrubbed, recompiled, repackaged — and again
> on the final file (user name, host name, project folders, server alias: none present). Manifest
> `Version="0.10.11"` with **no `PreRelease` attribute**. Tag `v0.10.11` → commit **`0512884`**, pushed; the
> GitHub release is ***Latest*** and not a pre-release (`draft=false`, `prerelease=false`, title *Avalonia
> Designer for VS Code v0.10.11*), and the asset was verified **three ways** — the local build, a fresh
> `gh release download`, and the API's own digest — all `20cfa4ce…`, 1,035,659 bytes. Installed locally as
> `grumpy.avalonia-designer@0.10.11`.
>
> An **earlier** build of the same version number — `935,035 bytes`, sha256
> `c1d8edd0cc396fdc0d143da2ac006f962630c574e98a8828d1299a6f5f95c841`, **5,364 assertions** — was packaged a
> day earlier and is *superseded*. It carries everything listed below **except** the charting tool and the
> workbook-sharing fix, both of which landed inside the same version number before the tag. **Never uploaded;
> do not use it.**
>
> **`0.10.11` is released on GitHub and was never uploaded.** The Marketplace listing carried `0.10.10`
> (published 2026-09-17) until **`0.11.0` went live on 2026-09-20** (verified: version, channel and hash, and
> 20 installs at the time of the check). Both are superseded as upload candidates by **`0.11.2`** above.
>
> **The docs ride inside the VSIX, so the released file carries the documentation of 2026-09-20 12:42** — the
> chart chapter in `USER_MANUAL.md` §19.1–19.8 (placing, data, the Series/Axis/Legend editors, the spreadsheet
> layout, the properties and the tips) plus its `CONTROLS.md` and `CHANGELOG.md` sections, but **not** the
> later revision of the same day (the cursor subsection §19.8, the renumbered tips, the refreshed totals in
> `TEST_PLAN.md` and `tests/README.md`). Those edits live in the repository and ship with the next version —
> or with this one, if it is re-packaged before the upload, in which case the hash above changes and the two
> must not be confused.
>
> **`0.10.10` (2026-09-17) — installed and tested on this machine; THIS is the file to upload.** Supersedes
> `0.10.9` (released on GitHub the same evening, **never uploaded**: a `/home/<user>/…` path from a bug-hunt note
> had reached the package as a compiled comment, so it was rebuilt, audited and then superseded by a new version
> rather than by replacing a released asset — see `NOTES.md` §135) and everything before it. `0.10.8`…`0.10.0`
> were installed and tested but never published, and the listing still carried `0.9.4` at that moment (**it has
since moved on: the listing carries `0.10.10` today — see the `0.11.0` block**), so `0.10.10` was the first
> version from this line to go out. It carries everything: the AI assist, the compiler as the second half of the
> code check, the build-driven repair loop, the host check, the Start / Stop controls for the user's own
> `llama-server`, the Remove Model fix, the model list as two entries over one download, the 30B step-up —
> **plus** this afternoon's fixes: the picker marks exactly one entry as pinned, `Start server` restarts a unit
> that is `active` but silent (its weights in swap), repair requests go to the runtime's own address instead of a
> stale `assistant.endpoint`, every log line reaches `logs/ai.log` (and a failed assist records the address it
> used), the GPU entry really offloads, ⚙ Settings says `Loading…` while it fills (and asks `lms` with a
> 3-second patience, cached 15 s), and the DataSet facts describe the generated class as it is — the fix that let
> the Vulkan-built 7B repair the user's own `CS1061` on the first run.
>
> **Dev-machine audit (asked by the user):** the VSIX was extracted and grepped for the user name, the host
> name, project folders, the server alias and `/home/` — none of them is in it. The only `/home/` left is in
> generic samples (`/home/x/a.gguf`, `/home/…/models/…gguf`, `/home/.../x.png`), and the one remaining project
> name is a **verbatim user quote** in `CHANGELOG.md` (*"My test program is OptimisedCSTest."*), left alone
> because history is quoted rather than edited.
>
> **FROZEN — do not repackage before uploading.** The release committee of one decided to publish `0.10.10`
> as it stands, and `USER_MANUAL.md` has since gained a "generated with AI assistance … Work In Progress" note
> at the top (2026-09-18). That note is **not** in this file: rebuilding now would produce a *different*
> artefact under a version that is already released. The note, and the new caret-anchored prompt for the AI
> assist, go out with the next version.
>
> Plain VSIX — `avalonia-designer-0.10.10.vsix`, **905,176 bytes**, sha256
> `ec4acc0e376e27b4e18120b8ad3e7bb2ab23befc7b03986efebbf3970bdab9a2` — built by `npm run package` after a green
> suite (**4,868 assertions, 0 failed**), and checked inside the package (manifest `Version="0.10.10"`, **no
> `PreRelease` attribute** — so it goes to the stable channel — `README.md`, `USER_MANUAL.md`, `CHANGELOG.md` and
> `CONTROLS.md` present; `NOTES.md`, `TEST_PLAN.md` and this file correctly absent). The docs ride **inside** the
> VSIX, so any later edit to those four changes the hash — this is the final build. Tag `v0.10.10` → commit
> **`d5edf83`**, pushed; the GitHub release is ***Latest*** and not a pre-release (`draft=false`,
> `prerelease=false`), and the asset was verified **three ways** — local build, a fresh `gh release download`,
> and the API's own `digest` — all `ec4acc0e376e27b4e18120b8ad3e7bb2ab23befc7b03986efebbf3970bdab9a2`,
> 905,176 bytes. Installed locally as `grumpy.avalonia-designer@0.10.10`.
> Leave *Pre-release* **unchecked** in the portal, then confirm with the
> `flags: 914` query that the version is `0.10.10` and `Microsoft.VisualStudio.Services.VsixSha256` equals the
> hash above.

> **`0.10.9` (2026-09-17) — released on GitHub, NEVER UPLOADED (superseded by `0.10.10`).** Its first build
> (905,053 bytes, `01ddd09f…`) went out as tag `v0.10.9`, and the cleanup rebuild (905,002 bytes, `9cf2316f…`)
> was not uploaded either: the user chose a new version over replacing a released asset. Both supersede
> `0.10.5`, `0.10.4`, `0.10.3`, `0.10.2`, `0.10.1` and `0.10.0` — all tagged and released on GitHub, none ever
> uploaded.

> **`0.10.5` (2026-09-17) — tagged, released and installed; NEVER UPLOADED (superseded by `0.10.9`).** Supersedes `0.10.4`
> (tagged the same day, never uploaded) and everything before it: the published listing still carries `0.9.4`,
> so the first version from this line is `0.10.5`, and it carries everything — the AI assist, the compiler as
> the second half of the code check, the `insert-semicolon` rule, the build-driven repair loop, the host check,
> the Start / Stop controls for the user's own `llama-server`, the Remove Model fix — **plus** the model list
> becoming two entries over one download (the 7B on the GPU build, and the same weights on the CPU build, with
> everything else folded under *Advanced…*) and the **30B step-up**: when a repair run ends without a clean
> build the extension asks before unloading the 7B, starting the user's unit and retrying once. See `NOTES.md`
> §134.
>
> Plain VSIX — `avalonia-designer-0.10.5.vsix`, 897,250 bytes, sha256
> `f52a4401ef321581f7784245dc58bf29b0ca8306936e5d30169da2435064a39e` — built by `npm run package` after a green
> suite (**4,829 assertions, 0 failed**), installed locally, and checked inside the package (version `0.10.5`,
> the two spec ids and the compiled `bigModel.js` present, dev docs absent). Tag `v0.10.5` → commit `d74d76a`;
> the GitHub release is *Latest* and not a pre-release, and the asset was verified three ways (local build,
> re-downloaded asset, the API's own `digest`). Note the docs ride **inside** the VSIX (`README.md`,
> `USER_MANUAL.md`, `CHANGELOG.md`, `CONTROLS.md`), so any edit to those changes the hash — this one is the
> final build. Leave *Pre-release* **unchecked** in the portal, then confirm with the `flags: 914` query that
> the version is `0.10.5` and `Microsoft.VisualStudio.Services.VsixSha256` equals the hash above.

> **`0.10.4` (2026-09-17) — tagged and released on GitHub, NEVER UPLOADED (superseded by `0.10.5`).** Supersedes `0.10.3`
> (tagged the same afternoon, never uploaded), `0.10.2`, `0.10.1` and `0.10.0`: the published listing still
> carries `0.9.4`, so the first version from this line is `0.10.4`, and it carries everything — the AI assist,
> the compiler as the second half of the code check, the `insert-semicolon` rule, the build-driven repair loop,
> the host check, the Start / Stop controls for the user's own `llama-server` — **plus** the fix for the failure
> the user hit minutes after `0.10.3` went up: Remove Model refused every selection that was not a plain
> `bundled:<id>` entry, silently and without logging anything, while the file it should have deleted sat in the
> extension's own storage. See `NOTES.md` §133.
>
> Plain VSIX — `avalonia-designer-0.10.4.vsix`, 889,626 bytes, sha256
> `b5f8ab989e2f01b8ae1657eade55964434366d092d04d9eef4ffcfc531caadc5` — built by `npm run package` after a green
> suite (**4,810 assertions, 0 failed**), installed locally, and checked inside the package (version `0.10.4`,
> dev docs absent). Tag `v0.10.4` → commit `a531a4e`; the GitHub release is *Latest* and not a pre-release, and
> the asset was verified three ways (local build, re-downloaded asset, the API's own `digest`). Note the docs
> ride **inside** the VSIX (`README.md`, `USER_MANUAL.md`, `CHANGELOG.md`, `CONTROLS.md`), so any edit to those
> changes the hash — this one is the final build. Leave *Pre-release* **unchecked** in the portal, then confirm
> with the `flags: 914` query that the version is `0.10.4` and
> `Microsoft.VisualStudio.Services.VsixSha256` equals the hash above.

> **`0.10.3` (2026-09-17) — tagged and released on GitHub, NEVER UPLOADED (superseded by `0.10.4`).** Supersedes `0.10.2` (tagged the
> same day, never uploaded), `0.10.1` and `0.10.0`: the published listing still carries `0.9.4`, so the first
> version from this line is `0.10.3`, and it carries everything — the AI assist, the compiler as the second half
> of the code check, the `insert-semicolon` rule, the build-driven repair loop, the host check with the
> experimental notice, the two fixes `0.10.2` carries (the loop's guard could not see a user's own
> `llama-server`, and the prompts never described the form's DataSet bindings) — **plus** *Start server* /
> *Stop server* for the user's own `llama-server` in ⚙ Settings → AI assist, the "who started it" owner line
> (unit, scope, uptime, pid, enabled at login) in the panel and in the status dialog, and a stop that always
> asks first. See `NOTES.md` §132.
>
> Plain VSIX — `avalonia-designer-0.10.3.vsix`, 887,507 bytes, sha256
> `cf7a7644f9d0b60ac10a8bc3c644d8e5130d4e5a0995e1f70e29e7fb49530843` — built by `npm run package` after a green
> suite (**4,781 assertions, 0 failed**), then installed locally with `code --install-extension … --force` and
> checked inside the package (version `0.10.3`, both new settings present, dev docs absent). Note the docs ride
> **inside** the VSIX (`README.md`, `USER_MANUAL.md`, `CHANGELOG.md`, `CONTROLS.md`), so any edit to those
> changes the hash — this one is the final build. Leave *Pre-release* **unchecked** in the portal, then confirm
> with the `flags: 914` query that the version is `0.10.3` and
> `Microsoft.VisualStudio.Services.VsixSha256` equals the hash above.

> **`0.10.2` (2026-09-17) — tagged and released on GitHub, NEVER UPLOADED (superseded by `0.10.3`).** Supersedes `0.10.1` (tagged the
> same day, never uploaded) and `0.10.0` (prepared the day before, never uploaded): the published listing still
> carries `0.9.4`, so the first version from this line is `0.10.2` and it carries everything — the AI assist,
> the compiler as the second half of the code check, the `insert-semicolon` rule, the build-driven repair loop,
> the host check with the experimental notice — **plus** the two fixes for the failure the user hit on their own
> app hours after `0.10.1` was tagged: the loop's guard could not see a `llama-server` the user had started
> themselves (so no model was ever asked), and the AI prompts never described the form's DataSet bindings (so
> the model invented `DataGrid.Items` for a ComboBox bound to a column). See `NOTES.md` §131.
>
> Plain VSIX — `avalonia-designer-0.10.2.vsix`, 873,063 bytes, sha256
> `bb77c940000da84c22c1953b258d702981784b4383c4a4286057ac6cfc947a1a` — built by `npm run package` after a green
> suite (**4,707 assertions, 0 failed**). Note the docs ride **inside** the VSIX (`README.md`, `USER_MANUAL.md`,
> `CHANGELOG.md`, `CONTROLS.md`), so any edit to those changes the hash — this one is the final build.
> Leave *Pre-release* **unchecked** in the portal, then confirm with the `flags: 914` query that the version is
> `0.10.2` and `Microsoft.VisualStudio.Services.VsixSha256` equals the hash above.

> **`0.10.1` (2026-09-17) — tagged and released on GitHub, NEVER UPLOADED (superseded by `0.10.2`).** Built,
> tested (4,670), committed (`620d613`), installed, and tagged: `v0.10.1` is a live GitHub release with its VSIX
> (sha256 `37b55532d70cb2027e7a0fceac25d5aac912f1f798a06c497aa917e27675c391`, verified three ways). It was the
> release prepared for the upload, and then the user's own app turned up two failures that made it the wrong
> first impression — so it stays as history and `0.10.2` goes out instead.

> **The Marketplace version must be numbers only** — a suffix is rejected outright (uploading `1.0.0-beta.7`
> failed on 2026-09-12 with *"The version string '1.0.0-beta.7' doesn't conform to the requirements for a
> version. It must be one to four numbers in the range 0 to 2147483647, with each number separated by a
> period."*). Since `0.10.0` that is the whole rule: **one number everywhere** — the GitHub tag, the release
> title and `package.json` all carry it, and the listing compares it, so each release is simply the next number
> up (`0.10.1`, `0.11.0`, …; the releases before `0.10.0` used a separate `v1.0.0-beta.N` tag, which is what the
> history above records). `1.0.0` is still reserved for the first stable release, because a published version
> number can never be reused — and the latest version cannot be deleted.

### What “Verifying \<version\>” means — and how to confirm the result

**“Verifying” is normal, not an error.** The version is stored and indexed but not yet *validated*;
that flips on its own (minutes to a few hours — `0.9.0` took well under an hour). **While it is
verifying, the extension is invisible in VS Code**, because VS Code's own gallery client always sends
`ExcludeNonValidated`. Its bundle spells the flags out —
`IncludeCategoryAndTags=4, IncludeSharedAccounts=8, IncludeVersionProperties=16,
ExcludeNonValidated=32, IncludeInstallationTargets=64, IncludeAssetUri=128` — and its query service
calls `withFlags(..., "ExcludeNonValidated")`. You can therefore watch the state from a terminal
without signing in: the same query returns the extension with `flags: 914` and **nothing** with
`flags: 950` until validation finishes.

```bash
curl -s -X POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery \
  -H "Accept: application/json;api-version=7.2-preview.1" -H "Content-Type: application/json" \
  -d '{"filters":[{"criteria":[{"filterType":7,"value":"grumpy.avalonia-designer"}],"pageNumber":1,"pageSize":1}],"flags":914}'
```

The response also proves *what* was published, which is worth checking every time:

- the version is the one you meant to ship, and `Publisher`/`Id` match `package.json`.
- `Microsoft.VisualStudio.Services.VsixSha256` equals `sha256sum` of your local VSIX, and the stored
  package downloads from `{assetUri}/Microsoft.VisualStudio.Services.VSIXPackage`.

> Compare the hash **only** between your local file and the stored copy. Two separate *builds* of the
> same source are never byte-reproducible — `vsce` stamps a fresh timestamp into
> `extension.vsixmanifest`, so identical content still yields different digests.

> **The Marketplace version must be numbers only.** A tag suffix is rejected — uploading
> `1.0.0-beta.7` fails with *"The version string '1.0.0-beta.7' doesn't conform to the requirements for
> a version. It must be one to four numbers in the range 0 to 2147483647, with each number separated
> by a period."* (Observed 2026-09-12.)
>
> This project therefore keeps **two** numberings: the GitHub releases/tags stay `v1.0.0-beta.N`
> (informative and friendly), while `package.json` — the number the Marketplace shows and compares —
> uses plain `major.minor.patch`. The line started at **`0.9.0`**: SemVer's "unstable, pre-1.0" band,
> and it leaves `1.0.0` free for the first stable release. Releases bump `0.9.1`, `0.9.2`, … and
> `1.0.0` then upgrades everyone automatically (VS Code always moves to the highest version).
> Publishing `1.0.0` *now* would burn that number — a version can never be reused, and the latest
> version cannot be deleted.

## F. Releasing after that

1. Bump `version` in `package.json` — **numbers only**, and the next number up (`0.10.1`, `0.11.0`, …).
   Commit, then tag the GitHub release with **the same number**: `git tag -a v0.10.1 -m "<one-line summary>"`.
   Tag and `package.json` are the same string since `0.10.0` (before that the tag was `v1.0.0-beta.N` and the
   listing carried `0.9.x`; that mapping is history, not a convention to continue). Never reuse a number — the
   Marketplace rejects the upload, and the latest version cannot be deleted.
2. Create the GitHub release with that tag —
   `git tag -a v0.10.1 -m "<one-line summary>"`, push the tag, then
   `gh release create v0.10.1 --title "Grumpy's WYSIWYG Designer for VS Code v0.10.1"
   --notes-file <file> --latest avalonia-designer-0.10.1.vsix`. Notes house style: an intro block
   ("Install:" + the `sha256` + a one-paragraph summary + `Test suite: N passed / 0 failed /
   0 skipped.`), then `### Added / ### Changed / ### Fixed / ### Notes`. **Set both flags explicitly:**
   `prerelease` and `make_latest` are *separate* fields, so clearing `--prerelease` alone leaves the repository
   with no latest release at all — `--latest` is what makes `gh release list` say **Latest** and
   `/releases/latest` resolve. Since `0.10.0` a release is **not** a pre-release: the listing has no
   pre-release channel entry and VS Code would not offer it to anyone on the stable channel. (Every release up
   to `v1.0.0-beta.11` is pre-release, and that is what it stays.)
3. Publish — through the publisher portal (part E), which is the route used since `0.9.0` and the one that
   survives the PAT retirement: `vsce package` locally, then upload the `.vsix` on the manage page. **Leave the
   listing's “Pre-release” box unchecked** so the release lands on the stable channel. For the CLI route the
   normal release is `npm run publish:stable`; `npm run publish:pre` puts the build on the other channel and is
   not used for a normal release.
4. Rotate the PAT before it expires (part B → **Regenerate**, then update the GitHub secret). An
expired token — or one retired on **1 December 2026** — appears as a 401 / *“verification failed”* in
the release run.

## G. After 1 December 2026 — publishing with Microsoft Entra ID

When global PATs are gone there is **no PAT fallback** (an organization-scoped token never worked for
Marketplace publishing — that is the 403 in Microsoft's own FAQ). The supported route is
**Entra ID authentication**: no long-lived secret at all, with `vsce` taking a short-lived Entra token.
Microsoft documents it as *“Secure automated publishing to Visual Studio Marketplace”*; it assumes
Azure (a subscription and a user-assigned managed identity).

1. **Azure DevOps → Service Connection** — *Project Settings → Service Connections → New → Azure
   Resource Manager*, authentication **Workload Identity Federation (manual)**; save it as a draft.
2. **Azure → user-assigned managed identity** — create one, assign the **Reader** role, and note its
   **client ID**, **tenant ID** and subscription.
3. **Federated credentials** — link the two sides (Azure DevOps provides the *issuer* and *subject*;
   Azure provides *client ID*, *tenant ID*, *subscription*), then *Verify and save*.
4. **Grant pipeline access** to that service connection.
5. **Read the identity's resource ID** — in a pipeline:
   `az rest -u https://app.vssps.visualstudio.com/_apis/profile/profiles/me --resource 499b84ac-1321-427f-aa17-267ca6975798`
   and keep the `id` field.
6. **Authorise the identity in the Marketplace** — add it as a **member of your publisher** with the
   **Contributor** role (publisher management page). Without this the publish is 401/403.
7. **Publish with Entra** — `vsce publish --azure-credential`, from a pipeline that is signed in to
   Azure first (`Azure/login` in GitHub Actions, `AzureCLI@2` in Azure Pipelines); from a laptop,
   `az login` plus the same flag is enough.

Requirements and caveats:

- **`vsce` ≥ 2.26.1** is needed for `--azure-credential`. This repository pins
  `@vscode/vsce@2.15.0` — fine for PAT publishing, too old for this. Bump the pin in `package.json`
  and in both workflows when you migrate.
- Managed identities can be billed like a user; give the identity **stakeholder** access to avoid
  identity charges.
- Microsoft's own example orchestrates all of this from Azure Pipelines. GitHub Actions works the
  same way (OIDC → Entra → `--azure-credential`), the publisher-member step in (6) is what actually
  grants the right.

## Optional: Open VSX (VSCodium / Theia users)

The same VSIX works there — sign in with GitHub at <https://open-vsx.org>, create an access token in
your profile, then:

```bash
npx ovsx publish avalonia-designer-<version>.vsix -p <token>
```

## Related

- Sources for the dates above: [Retirement of Global Personal Access Tokens in Azure DevOps](https://devblogs.microsoft.com/devops/retirement-of-global-personal-access-tokens-in-azure-devops/)
  (Azure DevOps blog, Dec 2025 — "December 1, 2026: all existing global PATs will be fully
  decommissioned") and [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
  (VS Code docs, updated 9 Sept 2026 — the Entra ID walkthrough in part G and the PAT scope FAQ).
- `.github/workflows/ci.yml` — compiles, runs the fast test layers and packages the VSIX on every push.
- `.github/workflows/release.yml` — the manual release run (full suite → package → publish). A missing
  `VSCE_PAT` degrades to a warning + a “⚠ NOT PUBLISHED” job summary instead of a failed run; a failed
  *publish* still fails the run.
- `npm run package` / `publish:pre` / `publish:stable` — all pin `@vscode/vsce@2.15.0`, so a release
  is reproducible. That pin has to become ≥ 2.26.1 for part G.
- `TEST_PLAN.md` §2 — what the suite covers; `NOTES.md` §1 — build, package and reload gotchas.
