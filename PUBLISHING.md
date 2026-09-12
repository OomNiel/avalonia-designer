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

Either route does the same thing:

- **From GitHub** — *Actions* → **Release** → *Run workflow*. First run with **pre_release** on and
  **dry_run** on (it builds, tests and packages, but publishes nothing). Once that is green, run it
  again with **dry_run** off.
- **From your machine** —
  ```bash
  VSCE_PAT=<paste-token> npm run publish:pre
  # or, once:  npx --yes @vscode/vsce@2.15.0 login grumpy   (stores it in your keychain)
  # then:      npm run publish:pre
  ```

The first publish creates the listing at
<https://marketplace.visualstudio.com/items?itemName=grumpy.avalonia-designer>, built from the
packaged `package.json` and `README.md`; it takes a few minutes to appear. A **pre-release** is hidden
from the Marketplace website's browse and search until a visitor ticks *“Show pre-release versions”*,
so expect no traffic until a stable version exists. (The gallery *query API* returns it regardless,
which is why `code --install-extension grumpy.avalonia-designer --pre-release` works straight away.)

> **Status: done — first listing live 2026-09-12 as `0.9.0`.** It was uploaded through the publisher
> portal's **Upload** button, so no PAT was involved. That path works today and needs no token; the
> `VSCE_PAT` workflow below is for automating later releases.

### What “Verifying \<version\>” means — and how to confirm the result

**“Verifying” is normal, not an error.** The version is stored and indexed but not yet *validated*;
that flips on its own within minutes to a few hours, and until it does, clients that exclude
unvalidated extensions are not offered the release. You can watch the state without signing in: bit 32
of the `extensionquery` `flags` is `ExcludeNonValidated`, so the same query returns the extension with
`flags: 914` and **nothing** with `flags: 950` while it is still verifying.

```bash
curl -s -X POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery \
  -H "Accept: application/json;api-version=7.2-preview.1" -H "Content-Type: application/json" \
  -d '{"filters":[{"criteria":[{"filterType":7,"value":"grumpy.avalonia-designer"}],"pageNumber":1,"pageSize":1}],"flags":914}'
```

The response also proves *what* was published, which is worth checking every time:

- `Microsoft.VisualStudio.Code.PreRelease` is `true` for a pre-release (`--pre-release` is the only
  way to set it — `vsce` cannot add the flag to a finished VSIX afterwards).
- the version is the one you meant to ship, and `Publisher`/`Id` match `package.json`.
- `Microsoft.VisualStudio.Services.VsixSha256` equals `sha256sum` of your local VSIX, and the stored
  package downloads from `{assetUri}/Microsoft.VisualStudio.Services.VSIXPackage`.

> Compare the hash **only** between your local file and the stored copy. Two separate *builds* of the
> same source are never byte-reproducible — `vsce` stamps a fresh timestamp into
> `extension.vsixmanifest`, so identical content still yields different digests.

> **The Marketplace version must be numbers only.** Semver pre-release tags are rejected — uploading
> `1.0.0-beta.7` fails with *"The version string '1.0.0-beta.7' doesn't conform to the requirements for
> a version. It must be one to four numbers in the range 0 to 2147483647, with each number separated
> by a period."* (Observed 2026-09-12.)
>
> This project therefore keeps **two** numberings: the GitHub releases/tags stay `v1.0.0-beta.N`
> (informative and friendly), while `package.json` — the number the Marketplace shows and compares —
> uses plain `major.minor.patch`. The first pre-release listing is **`0.9.0`**: SemVer's "unstable,
> pre-1.0" band, and it leaves `1.0.0` free for the first stable release. Further betas bump `0.9.1`,
> `0.9.2`, … and `1.0.0` then upgrades everyone automatically (VS Code always moves to the highest
> version). Publishing `1.0.0` *now* would burn that number — a version can never be reused, and the
> latest version cannot be deleted.

## F. Releasing after that

1. Bump `version` in `package.json` — **numbers only** (`0.9.1`, `0.9.2`, …). Commit, then tag the
   GitHub release with the descriptive semver name (`git tag v1.0.0-beta.8`, see `NOTES.md` §1). The
   tag and `package.json` deliberately differ: the tag is documentation, `package.json` is the number
   the Marketplace shows and compares. Never reuse a number — the Marketplace rejects the upload.
2. Publish:
   - `npm run publish:pre` for every `0.9.x` — it stays on the pre-release channel
   - `npm run publish:stable` for the real `1.0.0` — this flips the listing to stable, and users on a
     pre-release move across with it (VS Code always follows the highest version).
3. Rotate the PAT before it expires (part B → **Regenerate**, then update the GitHub secret). An
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
  (VS Code docs, updated 9 Sept 2026 — the Entra ID walkthrough in part G, the PAT scope FAQ and the
  pre-release version note).
- `.github/workflows/ci.yml` — compiles, runs the fast test layers and packages the VSIX on every push.
- `.github/workflows/release.yml` — the manual release run (full suite → package → publish).
- `npm run package` / `publish:pre` / `publish:stable` — all pin `@vscode/vsce@2.15.0`, so a release
  is reproducible. That pin has to become ≥ 2.26.1 for part G.
- `TEST_PLAN.md` §2 — what the suite covers; `NOTES.md` §1 — build, package and reload gotchas.
