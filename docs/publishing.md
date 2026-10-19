# Publishing Devly

Devly is one extension package (`.vsix`). Two registries make it searchable:

| Who should find it | Registry | Upload |
| --- | --- | --- |
| VS Code | Microsoft Marketplace | `vsce publish` |
| Cursor | Open VSX | `ovsx publish` |
| Antigravity, VSCodium, Windsurf | Open VSX | The same Open VSX upload |

The VS Code Marketplace listing does not appear in Cursor’s extension search. Upload the same file to both registries. Both registrations are free.

The publisher id in `apps/extension/package.json` is `devly`. The id you create on each site must match that field, or the upload is rejected.

## 1. Build the package

From the repo root:

```bash
pnpm build
cd apps/extension
npx vsce package --no-dependencies -o ../../devly.vsix
```

The VSIX is written to the repo root as `devly.vsix`.

## 2. Open VSX (Cursor and other Open VSX editors)

People search for Devly inside Cursor only after this upload.

1. Create an Eclipse account and put your GitHub username on it: https://accounts.eclipse.org/user/register
2. Sign in to Open VSX with that same GitHub account: https://open-vsx.org/
3. Open your profile, choose **Log in with Eclipse**, and sign the publisher agreement: https://open-vsx.org/user-settings/profile
4. Create an access token and copy it before you close the page: https://open-vsx.org/user-settings/tokens
5. Create the namespace and upload. The namespace must be `devly`.

```bash
npx ovsx create-namespace devly -p YOUR_TOKEN
npx ovsx publish devly.vsix -p YOUR_TOKEN
```

Run the publish command from the repo root, where `devly.vsix` sits. You can also set `OVSX_TOKEN` and pass `-p "$OVSX_TOKEN"`.

Official steps: https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions

Publisher agreement: https://www.eclipse.org/legal/open-vsx-registry-faq/

After it is accepted, the public page is https://open-vsx.org/extension/devly/devly. Cursor’s install behavior is described at https://cursor.com/help/customization/extensions.

## 3. VS Code Marketplace

1. Create the publisher (id `devly`) at https://marketplace.visualstudio.com/manage
2. Create an access token in Azure DevOps: https://dev.azure.com/
   - Organization: **All accessible organizations**
   - Scope: **Marketplace (Manage)**
3. Log in and publish from `apps/extension`:

```bash
npx vsce login devly
npx vsce publish
```

Official steps: https://code.visualstudio.com/api/working-with-extensions/publishing-extension

After it is accepted, the public page is https://marketplace.visualstudio.com/items?itemName=devly.devly.

Azure DevOps global personal access tokens retire on 1 December 2026. A new publisher should follow the sign-in method in the official publishing doc rather than a long-lived token.

A verified-publisher badge is free and unavailable until the extension and a domain are both six months old. A domain is optional for the first release.

## 4. What CI does

`.github/workflows/release.yml` builds `devly.vsix` and attaches it to a GitHub release. It does not upload to either registry. Publishing stays a manual step with the tokens above.
