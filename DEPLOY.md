# Deploying your own copy

The app is a single static page plus one Cloudflare Pages Function that stores
encrypted sync blocks in Workers KV. Hosting it yourself takes a token, a KV
namespace and one deploy command.

## One-time setup

**1. Create an API token**

At `dash.cloudflare.com/profile/api-tokens`, press **Create Token**, scroll to
the bottom and pick **Create Custom Token**. Give it exactly two permissions:

| Type | Resource | Access |
|---|---|---|
| Account | Cloudflare Pages | Edit |
| Account | Workers KV Storage | Edit |

Under **Account Resources** pick your account, then create it and copy the
token. Nothing else is needed: both Pages and KV are account-level, so no Zone
permission is involved.

**2. Point the shell at your account**

```bash
export CLOUDFLARE_API_TOKEN="paste-the-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"   # shown on any dashboard page
```

On Windows PowerShell use `$env:CLOUDFLARE_API_TOKEN = "..."` instead.

**3. Create the KV namespace and the project**

```bash
npx wrangler kv namespace create VAULT
npx wrangler pages project create microcards-generator --production-branch main
```

Copy the id that the first command prints into `wrangler.toml`, under
`[[kv_namespaces]]` → `id`. That file already has the binding name `VAULT`,
which is what `functions/api/vault/[[path]].js` reads.

## Every deploy

```bash
sh build.sh
npx wrangler pages deploy
```

`build.sh` folds `content-guide.md` into `template.html` to produce
`index.html`, then copies it to `public/`, which is the folder Pages serves.
`wrangler.toml` supplies the output folder and the KV binding, so the deploy
command needs no arguments.

## Optional: picking sources from Google Drive

The **From Drive** button needs a Google Cloud project. The scope it asks for
is `drive.file`, which only ever covers the files a person picks in Google's
own dialog, so the app sees nothing else in their Drive and Google does not put
it through app verification.

1. At `console.cloud.google.com`, create a project and enable both **Google
   Picker API** and **Google Drive API** under APIs & Services → Library.
2. Configure the OAuth consent screen (External), then publish it so anyone can
   use it rather than just your test users.
3. Credentials → Create credentials → **OAuth client ID** → Web application.
   Add your site to **Authorized JavaScript origins**, for example
   `https://microcards-generator.pages.dev`, with no trailing slash.
4. Credentials → Create credentials → **API key**. Restrict it to the Picker
   API and to your site.
5. In the app, open Settings and paste the client ID, the API key and, from the
   project's dashboard, the project number.

The three values live in the browser, not in the repo, so each person hosting a
copy uses their own.

## Good to know

- **Workers KV lists are eventually consistent.** A record is written
  immediately, but it can take up to about a minute to show up in the listing
  the app uses to work out what changed. A second device may therefore need a
  second sync a minute later to see brand new card sets.
- **The free KV plan allows about 1,000 writes a day.** Each folder or card set
  is one write per sync, so personal use stays well inside it.
- **The server never holds a key.** The sync code stays in the browser and
  derives both the vault name (SHA-256) and the AES-GCM 256 key (PBKDF2,
  150,000 rounds), so losing the code means the vault cannot be recovered.
- **Keep the token out of the repo.** `.env` and `cf-token.txt` are in
  `.gitignore`; prefer setting the token as a shell variable only when you
  deploy.
