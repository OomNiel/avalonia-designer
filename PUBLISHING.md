# Publishing the extension (maintainer guide)

How to publish **Avalonia Designer for VS Code** to the Visual Studio Marketplace: create the
publisher, create the access token, store it for CI, and push a release.

> **This document is for whoever maintains the extension** — it is *not* shipped inside the VSIX
> (it is listed in `.vscodeignore`).
>
> Prerequisite: the `version`, `publisher`, `icon`, `license` and `repository` fields in
> `package.json` are what the Marketplace shows. The publisher **ID** there must match the publisher
> you register below, or `vsce publish` fails with *"not a valid publisher"*.

State when this was written (2026-09-12) — re-check the first two before a first publish:

| Check | Result |
|---|---|
| Publisher ID `grumpy` on the Marketplace | free (no publisher page) |
| Extension `grumpy.avalonia-designer` | unused (0 gallery matches) |
| GitHub repository `OomNiel/avalonia-designer` | public (the listing's repository link needs that) |

---

## A. Create the publisher

1. Open <https://marketplace.visualstudio.com/manage> and sign in with the Microsoft account that
   should own the extension. A personal account is fine; a work/school account must belong to an
   Entra ID tenant.
2. Choose **Create publisher** and fill in:
   - **ID** — `grumpy` (must equal `"publisher"` in `package.json`, exactly)
   - **Name** — the display name shown on the listing (e.g. `Grumpy` or `OomNiel`)
3. Save. The optional **verified** badge needs a domain/TXT record — skip it until the listing is
   live.

> Prefer a different ID? Change `"publisher"` in `package.json` to the new ID; the two must match.

## B. Create the personal access token (PAT)

A PAT is an Azure DevOps artefact, so you need a (free) Azure DevOps **organization** to create one —
it does not have to be related to the repository.

1. Go to <https://aex.dev.azure.com/me> and sign in with the **same** account you used for the
   publisher. Create a free organization if you have none (e.g. `oomniel`).
2. Open the token page for that organization:
   `https://dev.azure.com/<your-org>/_usersSettings/tokens`
   (or the gear icon, top right → **Personal access tokens**).
3. Choose **New Token** and use exactly these settings:
   - **Name** — `vsce-marketplace`
   - **Organization** — **All accessible organizations** *(a single-organization token usually fails)*
   - **Expiration** — the shortest you are comfortable with (maximum 1 year); note the date somewhere
   - **Scopes** — **Show all scopes**, then tick **Marketplace → Manage**
     *(this is the only scope needed; neighbouring read scopes are not enough)*
4. Choose **Create** and copy the token **immediately** — it is shown only once.

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
**Marketplace → Manage**) and the organization (needs **All accessible organizations**).

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
from search until a visitor ticks *“Show pre-release versions”*, so expect no traffic until a stable
version exists.

## F. Releasing after that

1. Bump `version` in `package.json`, commit and tag (see `NOTES.md` §1 for the exact commands).
2. Publish:
   - `npm run publish:pre` while the version carries a `-beta` tag (e.g. `1.0.0-beta.8`)
   - `npm run publish:stable` for a real `1.0.0` — this flips the listing to stable, and users on a
     pre-release move across with it.
3. Rotate the PAT before it expires (part B → **Regenerate**, then update the GitHub secret). An
   expired token appears as a 401 / *“verification failed”* in the release run.

## Optional: Open VSX (VSCodium / Theia users)

The same VSIX works there — sign in with GitHub at <https://open-vsx.org>, create an access token in
your profile, then:

```bash
npx ovsx publish avalonia-designer-1.0.0-beta.7.vsix -p <token>
```

## Related

- `.github/workflows/ci.yml` — compiles, runs the fast test layers and packages the VSIX on every push.
- `.github/workflows/release.yml` — the manual release run (full suite → package → publish).
- `npm run package` / `publish:pre` / `publish:stable` — all pin `@vscode/vsce@2.15.0`, so a release
  is reproducible.
- `TEST_PLAN.md` §2 — what the suite covers; `NOTES.md` §1 — build, package and reload gotchas.
