# Hand-Gesture Portal Filter — Web

Browser version of the [Python hand-gesture portal filter](../README.md).
Camera frames are processed locally. The browser downloads MediaPipe's WASM
runtime and hand model from jsDelivr and Google when starting.

## Develop

Use Node.js 24 LTS (or `nvm use` inside `web/`).

```sh
cd web
npm ci
npm run dev
```

Open the local URL printed by Vite and allow camera access. Spread both hands
apart to open a quadrilateral portal whose four corners follow your thumbs and
index fingertips; pinch thumb + pinky to cycle filters. The buttons
select filters and save a screenshot.

## Test and build

```sh
npm test
npm run build
npm run preview
```

The static output is `web/dist/`. Preview is available at
`http://localhost:4173/hand-gesture-portal-filter/`.
For a host serving from the domain root, build with `npm run build -- --base=/`.
Camera access requires HTTPS or localhost. Initial model loading requires internet
access and hand tracking currently requires a browser with GPU support.

## GitHub Pages

1. In the repository's **Settings → Pages → Build and deployment**, select
   **GitHub Actions** as the source.
2. Ensure the `github-pages` environment allows deployment from the default
   branch (currently `dev`).
3. Push these changes to the default branch, or run **Build and deploy web app**
   from the Actions tab on that branch.

The workflow installs locked dependencies, runs tests, builds, and deploys the
static artifact. Pull requests and pushes to `main`/`dev` run build checks;
only the repository's default branch deploys. Failed tests or builds prevent deployment.

After a successful deployment, the site is available at:
https://duckmahn.github.io/hand-gesture-portal-filter/

The Vite base path is configured for this repository name. Update
`vite.config.js` when renaming the repository, or override `--base` for another host.

## Manual browser check

With the production preview open, allow the camera, wait for tracking to load,
spread/hide both hands, cycle all four filters, and download a screenshot.
Also check the error message when camera access is denied. Unit tests cover the
pure filter, gesture, landmark extraction, and portal state logic; they do not
verify real camera/GPU behavior.
