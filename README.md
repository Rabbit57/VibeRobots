# AILO Game Template

Reusable starter for browser games published under **AILO Games**.

A game created from this template gets:

- React 19 + Vinext
- Cloudflare Workers deployment
- automatic production hostname derived from one slug
- GitHub Actions checks and deployment on `main`
- a small interactive starter game you can replace
- only **one GitHub secret** per game repository

## 0. Enable GitHub template mode

In this repository, open **Settings → General** and enable **Template repository**. After that, GitHub will show a **Use this template** button for creating future games.

## 1. Set the Cloudflare Account ID once in this template

Edit `ailo.config.ts` and replace:

```ts
accountId: 'CHANGE_ME_CLOUDFLARE_ACCOUNT_ID'
```

with the Cloudflare Account ID used by AILO Games.

The Account ID is an account identifier, not an authentication secret, so it is safe to keep in the repository configuration. The API token must remain secret.

Once this is set in the template, every repository created from the template inherits the same Account ID automatically.

## 2. Create a game from this template

Use **Use this template** to create a new repository.

Then clone it and install dependencies:

```bash
npm install
```

Commit the generated `package-lock.json` so later CI runs use `npm ci` automatically.

## 3. Configure the game

Edit the game section of `ailo.config.ts`:

```ts
export const ailoGame = {
  slug: 'space-racer',
  title: 'Space Racer',
  description: 'Race through a collapsing asteroid field.',
} as const;
```

The slug automatically determines:

```text
Worker: ailo-space-racer
Domain: space-racer.ailocalops.com
```

Slugs must use lowercase letters, numbers, and single hyphens.

## 4. Build the game

Replace `components/game.tsx` with the actual browser game UI and logic. Add any assets under `public/`.

Run locally:

```bash
npm run dev
```

Validate before pushing:

```bash
npm run typecheck
npm run lint
npm run build
```

## 5. Add the one GitHub Actions secret

In each new game repository:

**Settings → Secrets and variables → Actions**

Add only:

```text
CLOUDFLARE_API_TOKEN
```

Use the same Cloudflare deployment token used by the other AILO Workers. Never commit this token.

The Cloudflare Account ID is already inherited from `ailo.config.ts`, so there is no `CLOUDFLARE_ACCOUNT_ID` repository secret anymore.

## 6. Deploy

Push to `main`:

```bash
git add .
git commit -m "Publish game"
git push
```

GitHub Actions will:

1. install dependencies
2. typecheck
3. lint
4. build
5. validate the AILO game and Cloudflare account config
6. deploy the Worker
7. attach `<slug>.ailocalops.com` as a Cloudflare Custom Domain

Pull requests run checks but do not deploy production.

The template repository itself deliberately skips deployment.

## 7. Add the game to the AILO portal

In `Rabbit57/game-site`, add the game to the catalog using an external launch URL:

```ts
{
  slug: 'space-racer',
  title: 'Space Racer',
  cover: '/images/space-racer.webp',
  coverAlt: 'Space Racer cover art.',
  description: 'Race through a collapsing asteroid field.',
  status: 'playable',
  launch: {
    kind: 'external',
    url: 'https://space-racer.ailocalops.com/',
    aspectRatio: 16 / 9,
  },
}
```

Then push `game-site/main`; the portal deploys automatically.

## Deployment model

```text
new game repo
   ↓ git push main
GitHub Actions
   ↓ one secret: CLOUDFLARE_API_TOKEN
Cloudflare Worker: ailo-<slug>
   ↓
https://<slug>.ailocalops.com
   ↓ embedded by
https://ailocalops.com
```

For large Unity/Godot/WASM/static builds, use the separate R2 publishing path rather than this Worker-app template.
