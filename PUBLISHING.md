# Publishing the extension (maintainer guide)

How to publish **Avalonia Designer for VS Code** to the Visual Studio Marketplace: create the
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

> **`0.10.11` (2026-09-18) — built, installed and audited; ready for its own release when the user says so.**
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
>
> Plain VSIX — `avalonia-designer-0.10.11.vsix`, **927,818 bytes**, sha256
> `b3cc77d0e240281dc2be22da6005531fbd4545a36d2b05686637d874389e9cff` — the **final** build of `0.10.11`
> (six earlier builds of this version were installed on this machine but never released, and are all
> superseded by this one), built by `npm run package` after a green suite (**5,059 assertions, 0 failed**;
> **5,066** with the property-compliance reset forced, which is what verified TreeView's properties against
> Avalonia 12.1.1), manifest `Version="0.10.11"` with **no `PreRelease` attribute**, and
> audited the same way as `0.10.9` (extract the VSIX, grep it for the user name, host name, project folders and
> server alias — none present). **THIS is the file to upload** once `0.10.10` has gone out; `0.10.10` remains the
> file for the *imminent* upload, frozen below.
>
> **`0.10.10` (2026-09-17) — installed and tested on this machine; THIS is the file to upload.** Supersedes
> `0.10.9` (released on GitHub the same evening, **never uploaded**: a `/home/<user>/…` path from a bug-hunt note
> had reached the package as a compiled comment, so it was rebuilt, audited and then superseded by a new version
> rather than by replacing a released asset — see `NOTES.md` §135) and everything before it. `0.10.8`…`0.10.0`
> were installed and tested but never published, and the listing still carries `0.9.4`, so `0.10.10` is the first
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
   `gh release create v0.10.1 --title "Avalonia Designer for VS Code v0.10.1"
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
