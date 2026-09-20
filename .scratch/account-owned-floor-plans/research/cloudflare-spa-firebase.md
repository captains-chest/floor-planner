# How does a Cloudflare static SPA host Firebase Auth, CSP, and signup routes?

Type: research
Repo context: Angular 22 static SPA (production on Cloudflare, not a container). Firebase is Auth, Firestore, Storage, and Cloud Functions for invite mint/redeem. Accounts are email/password only. Client routes include `/signup/:id`; invalid GUID becomes an in-app 404.

This note answers the research question from Cloudflare and Firebase **primary docs**. It does not pick Pages vs Workers; that is the follow-on grilling ticket.

## Short answer

Both **Cloudflare Pages** and **Workers static assets** can host this SPA. Pages infers SPA fallback when there is no top-level `404.html`. Workers requires an explicit `assets.not_found_handling = "single-page-application"`. Cloudflare’s 2025 guidance is to start new projects on Workers; Pages remains supported. Invite logic must stay in Firebase Functions, not a Worker.

`/signup/:id` must receive `index.html` (HTTP 200). An invalid GUID 404 is an Angular route after boot, not an edge 404. Do not add a root `404.html` on Pages if you want that SPA fallback.

Set CSP with a `_headers` file in the static asset directory (Pages and Workers). If the hostname is proxied on Cloudflare, a Response Header Transform Rule can also set `Content-Security-Policy`.

`connect-src` must allow Identity Toolkit, Secure Token, Firestore, Storage, and the Functions origin. `img-src` must allow Storage download URLs (plus existing `data:` / `blob:` for unsigned scans). `frame-src` is unused for email/password sign-in; add `https://<projectId>.firebaseapp.com` (and reCAPTCHA hosts) only if the Auth iframe or bot-protection widgets run.

Auth **authorized domains** must include `localhost` and the production Cloudflare hostname. Password-reset `ActionCodeSettings.url` must use an authorized domain. Email/password sign-in is neither popup nor redirect; `signInWithRedirect` on a non-Firebase-Hosting origin is the painful path and is not needed here.

## 1. Pages vs other static products

Cloudflare currently has two first-party ways to serve a static site:

| Product | What it is | SPA fallback | CSP / headers | Custom domain outside Cloudflare DNS |
| --- | --- | --- | --- | --- |
| [Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/) | Git-connected (or direct-upload) static hosting; optional Pages Functions | Automatic if there is **no** top-level `404.html` | [`_headers`](https://developers.cloudflare.com/pages/configuration/headers/) | [Supported via CNAME](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/#compatibility-matrix) |
| [Workers static assets](https://developers.cloudflare.com/workers/static-assets/) | Upload a directory with the Worker; **no Worker script required** | Explicit `not_found_handling` | Same [`_headers`](https://developers.cloudflare.com/workers/static-assets/headers/) | [Not supported](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/#compatibility-matrix) — hostname must be in a Cloudflare zone |

Cloudflare’s own platform post: *“Now that Workers supports both serving static assets and server-side rendering, you should **start with Workers**. Cloudflare Pages will continue to be supported, but, going forward, all of our investment, optimizations, and feature work will be dedicated to improving Workers.”* ([blog, 2025-04-08](https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/))

That is a **hosting** recommendation, not a requirement to run Worker code. A Worker that only sets `assets.directory` (no `main` script) is still a static SPA: static asset requests are free, same as Pages ([migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)). ADR 0010 rejected **Workers as the invite server**, not Workers as a static file host.

Pages still has a first-party Angular guide (`npm create cloudflare@latest -- my-angular-app --framework=angular --platform=pages`) and a documented Git build: command `npm run build`, output `dist/cloudflare` or `dist/cloudflare/browser` when using their adapter ([Pages Angular](https://developers.cloudflare.com/pages/framework-guides/deploy-an-angular-site/)). This repo is a vanilla `@angular/build:application` app; production output is `dist/floor-planner/browser` (see `Dockerfile`). Workers’ Angular guide auto-detects `assets.directory: dist/browser` for C3 scaffolds ([Workers Angular](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/angular/)); for this repo the directory to point at is `dist/floor-planner/browser`.

Other Cloudflare products that are **not** a fit as the static host:

- **Pages Functions / a Worker `main` script** — compute in front of assets. Unneeded for Floor plan CRUD (browser → Firebase). Would be the invite server if we put mint/redeem here; ADR 0010 rejected that.
- **Firebase Hosting** — rejected in ADR 0010. Still exists as Auth’s default `*.firebaseapp.com` / `*.web.app` helper origin (see §7).
- **Workers Sites** (KV-backed) — superseded; Cloudflare documents migrating *from* Workers Sites *to* Pages, and now from Pages *to* Workers assets.

**Practical split for this app:** Pages is the least-config path (auto SPA, Git previews, custom domain even off-Cloudflare DNS). Workers assets is the current “start here” product, needs one Wrangler flag for SPA mode, and cannot attach a custom domain unless the zone is on Cloudflare.

## 2. SPA rewrite for `/signup/:id` and 404

Invite mail links to `https://<cloudflare-origin>/signup/<id>`. That path is not a file in `dist/`. The edge must return the Angular shell so the client router can redeem or show 404.

### Pages

From [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/):

- If an HTML file matches the path, Pages serves it.
- If a **top-level `404.html` exists**, unmatched paths serve the nearest `404.html` (HTTP 404).
- **If there is no top-level `404.html`**, Pages treats the project as an SPA (explicitly including Angular) and “matches all incoming paths to the root (`/`)”, so `/about` or `/help` are handled in the client.

Consequence: **do not ship a root `404.html`** if `/signup/:id` and other client routes must boot Angular. An in-app 404 is a router component, not `404.html`.

[`_redirects`](https://developers.cloudflare.com/pages/configuration/redirects/) can also **proxy** (rewrite) with status `200`:

```txt
/signup/* /index.html 200
```

That is optional on Pages when SPA mode is already on. Status codes other than redirects + `200` proxy are **not** supported (`/blog/* /blog/404.html 404` is listed as unsupported). Redirects always run, even when an asset matches, and they run **before** headers.

### Workers static assets

SPA mode is **not** inferred. From [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/) and the [Pages → Workers migration](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/):

```jsonc
{
  "name": "floor-planner",
  "compatibility_date": "2026-09-20",
  "assets": {
    "directory": "./dist/floor-planner/browser/",
    "not_found_handling": "single-page-application"
  }
}
```

That serves `/index.html` with **`200 OK`** when the request does not match a file. Alternative `not_found_handling`: `"404-page"` (custom `404.html`) or `"none"` (generic 404). For this SPA, use `"single-page-application"`.

If a Worker script is present and compatibility date ≥ `2025-04-01`, **navigation** requests (`Sec-Fetch-Mode: navigate`) prefer assets and do not invoke the script. That does not matter unless we add a Worker. Do not add `run_worker_first` just to host the SPA.

`_redirects` on Workers is the same file format as Pages, including `200` proxying ([Workers redirects](https://developers.cloudflare.com/workers/static-assets/redirects/)). Prefer `not_found_handling` over a catch-all `/* /index.html 200` so hashed assets that 404 stay 404s only when they are missing *and* you have not enabled SPA mode — with SPA mode, unmatched paths including a missing hashed JS file also get `index.html`. Same class of behavior as nginx `try_files $uri $uri/ /index.html`.

### What “404” means here

| Event | Who returns 404 | What the edge must do |
| --- | --- | --- |
| Direct load of `/signup/<guid>` | Angular, after boot, if the Function says the Invitation is invalid | Serve `index.html` 200 |
| In-app navigation to a missing route | Angular router | Same SPA fallback (or already in the shell) |
| Missing hashed asset (`*.js` / `*.css`) | Ideally HTTP 404 | File exists after a successful deploy; SPA fallback will still mask a missing hash with HTML |
| Dotfiles / non-GET | Not specified by Cloudflare static products the way nginx `deny` / 405 did | Optional; not required for Auth |

The HTTP status of `/signup/:id` and the in-app 404 page will be **200** under SPA fallback. That is the documented Pages/Workers SPA behavior, and it matches the current nginx `try_files`. A true edge 404 for unknown paths would break the invite link unless every client route is listed as a `200` rewrite.

## 3. How response headers set CSP

Cloudflare does not invent CSP for a static site. You attach `Content-Security-Policy` yourself.

### `_headers` file (Pages and Workers)

Same mechanism on both products ([Pages headers](https://developers.cloudflare.com/pages/configuration/headers/), [Workers headers](https://developers.cloudflare.com/workers/static-assets/headers/)):

- Plain text file named `_headers` (no extension) in the **static asset directory**.
- Not served as an asset; parsed and applied to **static asset responses**.
- Put it in `public/` so Angular copies it into `dist/floor-planner/browser/` (this repo already copies `public/` as assets).
- Limits: 100 rules; **2,000 characters per line** (the whole `Content-Security-Policy: …` line counts).
- Duplicate header names on the same rule are joined with a comma.
- Redirects win over headers when both match.

Example from those docs (security headers, including CSP):

```txt
/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; …
```

`_headers` is **not** applied to responses generated by a Worker script or Pages Functions. For a static SPA with no `main` / no `functions/`, that caveat does not apply.

Pages already sends, among others, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Access-Control-Allow-Origin: *` ([Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)). The `*` CORS header is on **this origin’s static responses**, not a substitute for Firebase CORS. Override or detach with `! Access-Control-Allow-Origin` if you do not want `*`.

Workers default static headers: `Content-Type`, `Cache-Control: public, max-age=0, must-revalidate` (when no `Authorization`/`Range`), `ETag` ([Workers headers](https://developers.cloudflare.com/workers/static-assets/headers/)). Fingerprinted Angular files can take a longer `Cache-Control` via `_headers` on hashed paths; `index.html` should stay revalidated.

### Response Header Transform Rules

If the hostname is [proxied](https://developers.cloudflare.com/dns/proxy-status/) through Cloudflare, [Response Header Transform Rules](https://developers.cloudflare.com/rules/transform/response-header-modification/) can set or replace `Content-Security-Policy`. Cloudflare’s CSP note lists two official ways to **add** CSP: Transform Rules on a proxied zone, or `_headers` on Pages ([CSPs and Cloudflare](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/content-security-policies/)). Workers `_headers` is the same file as Pages.

Transform Rules cannot add/modify headers whose names start with `cf-` or `x-cf-`. CSP is allowed.

Prefer `_headers` in the repo so CSP is reviewed with the app, not only in the dashboard.

### Do not use these for CSP here

- **Zaraz / Rocket Loader / Web Analytics / Turnstile** — each needs extra `script-src` / `connect-src` hosts if enabled. Default CSP in `deploy/nginx/security-headers.conf` does not allow them; keep them off or extend CSP.
- **A Worker that clones the response to append headers** — [Pages “add custom HTTP headers”](https://developers.cloudflare.com/pages/how-to/add-custom-http-headers/) shows this pattern. Unnecessary when `_headers` works on static assets.

## 4. Origins for `connect-src` / `img-src` / `frame-src`

Firebase does not publish a single “CSP checklist” page. Origins below are the **service hostnames the official client docs and API map actually call**.

Firebase API map ([API keys](https://firebase.google.com/docs/projects/api-keys)):

| Service | API hostname |
| --- | --- |
| Authentication | `identitytoolkit.googleapis.com` |
| Token refresh | `securetoken.googleapis.com` |
| Cloud Firestore | `firestore.googleapis.com` |
| Cloud Storage for Firebase | `firebasestorage.googleapis.com` |

Chrome-extension Auth docs (same JS SDK) also allowlist `https://apis.google.com`, `https://www.gstatic.com`, `https://www.googleapis.com`, `https://securetoken.googleapis.com` in CSP ([Chrome extension Auth](https://firebase.google.com/docs/auth/web/chrome-extension)). Email/password on the web hits Identity Toolkit + Secure Token; the extra Google hosts show up for helper iframes, reCAPTCHA, and some SDK loads.

### Auth — `connect-src`

Email/password uses `signInWithEmailAndPassword` / `sendPasswordResetEmail` against Identity Toolkit, then token refresh against Secure Token ([password auth](https://firebase.google.com/docs/auth/web/password-auth), [API keys example](https://firebase.google.com/docs/projects/api-keys) `https://identitytoolkit.googleapis.com/v1/accounts:…?key=`).

```
connect-src 'self'
  https://identitytoolkit.googleapis.com
  https://securetoken.googleapis.com
```

Add `https://www.googleapis.com` if the SDK or recaptcha config fetch goes there (see `initializeRecaptchaConfig` in the [Auth JS API](https://firebase.google.com/docs/reference/js/auth.md#initializerecaptchaconfig_2a61ea7)).

`authDomain` in `firebaseConfig` defaults to `<projectId>.firebaseapp.com`. That origin hosts `/__/auth/handler`, `/__/auth/iframe`, `/__/firebase/init.json` ([redirect best practices](https://firebase.google.com/docs/auth/web/redirect-best-practices), [Identity Platform custom domain](https://docs.cloud.google.com/identity-platform/docs/show-custom-domain)). Email/password does **not** navigate there. If the SDK still loads the iframe helper (bot protection / recaptcha), that host belongs in `frame-src` and possibly `script-src` / `connect-src`.

### Firestore — `connect-src`

The web client talks to the Firestore API:

```
connect-src … https://firestore.googleapis.com
```

The modular web SDK uses HTTPS (WebChannel / REST) to that host, not Realtime Database’s `wss://*.firebaseio.com`. Do not copy RTDB websocket hosts into this CSP unless we add Realtime Database (rejected in ADR 0002).

### Storage — `connect-src` and `img-src`

SDK calls go to `https://firebasestorage.googleapis.com` ([download files](https://firebase.google.com/docs/storage/web/download-files) uses URLs like `https://firebasestorage.googleapis.com/b/bucket/o/…`). `getDownloadURL()` then puts that URL on `<img src>` **or** fetches it with XHR.

Default bucket name is `PROJECT_ID.firebasestorage.app` (created on/after Sep 2024) or legacy `PROJECT_ID.appspot.com` ([Storage get started](https://firebase.google.com/docs/storage/web/start)).

```
connect-src … https://firebasestorage.googleapis.com https://storage.googleapis.com
img-src 'self' data: blob: https://firebasestorage.googleapis.com https://storage.googleapis.com https://*.firebasestorage.app
```

Include `https://*.appspot.com` only if the bucket is the legacy name. Guest unsigned scans stay `data:` / `blob:` in IndexedDB (existing nginx `img-src`).

**CORS is separate from CSP.** Direct browser downloads (`getBlob` / `<img>` to a download URL) need a bucket CORS policy; Firebase documents `gsutil cors set` with `origin` = your web origin ([download files](https://firebase.google.com/docs/storage/web/download-files), [Cloud Storage CORS](https://docs.cloud.google.com/storage/docs/cross-origin)). Put the Cloudflare origin (and `http://localhost:4200` for `ng serve`) in that JSON. CSP cannot fix a CORS failure.

### Callable / HTTP Functions — `connect-src`

After deploy, HTTP functions are invoked at ([HTTP functions](https://firebase.google.com/docs/functions/http-events)):

```
https://<region>-<project-id>.cloudfunctions.net/<functionName>
```

2nd gen also has a Cloud Run URL of the form `https://<function-name>-<hash>.<region>.run.app` (documented for the experimental Dart client; the JS `httpsCallable(name)` path still uses the Cloud Functions host unless you pass `httpsCallableFromURL`). Pin the **exact** URL the CLI prints after deploy.

```
connect-src … https://<region>-<project-id>.cloudfunctions.net
# and/or https://*.<region>.run.app if the client uses the Cloud Run URL
```

Wildcards in CSP: `https://*.cloudfunctions.net` is valid in modern CSP3. Prefer the concrete origin.

CORS on the Function is **not** CSP:

- **Callables** default to allowing all origins; restrict with `onCall({ cors: ["https://<cloudflare-origin>"] }, …)` ([callable functions](https://firebase.google.com/docs/functions/callable)).
- **HTTP `onRequest`** defaults to **no** CORS (`cors` default `false`). A browser call from Cloudflare will fail until `cors` includes that origin or `true` ([HTTP functions](https://firebase.google.com/docs/functions/http-events)).

Invite mint/redeem from the SPA therefore need both `connect-src` **and** Function `cors` set to the Cloudflare origin (and localhost for emulator/dev if used).

### `frame-src`

| Feature | Needed? | Hosts |
| --- | --- | --- |
| Email/password `signInWithEmailAndPassword` | No iframe in the password-auth guide | — |
| OAuth popup/redirect helper | Yes, if used | `https://<projectId>.firebaseapp.com` (or custom `authDomain`) |
| reCAPTCHA / Auth bot protection | Yes, if enabled | `https://www.google.com`, `https://www.gstatic.com`, `https://www.recaptcha.net` (plus `script-src` for the same) |
| Embedding Storage images | No — that is `img-src` | — |

Default posture for this app (email/password, no Google provider): `frame-src 'none'` or omit and inherit `default-src 'self'`. If sign-in fails in production with a CSP frame violation, add the `authDomain` origin.

### Suggested CSP shape (port of `deploy/nginx/security-headers.conf`)

```txt
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-XSS-Protection: 0
  Content-Security-Policy: default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'; img-src 'self' data: blob: https://firebasestorage.googleapis.com https://storage.googleapis.com https://*.firebasestorage.app; style-src 'self' 'unsafe-inline'; script-src 'self'; script-src-attr 'unsafe-inline'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebasestorage.googleapis.com https://storage.googleapis.com https://REGION-PROJECT.cloudfunctions.net; font-src 'self'; worker-src 'self' blob:; frame-src 'none'
```

Replace `REGION-PROJECT` after Functions deploy. Keep `script-src-attr 'unsafe-inline'` (Angular still inlines stylesheet onload in the current nginx CSP). Stay under the 2,000-character `_headers` line limit.

## 5. Auth authorized domains

Firebase Auth will not run in the browser on a host that is missing from **Authentication → Settings → Authorized domains**.

Primary sources:

- Continue URLs: *“In order to securely pass a continue URL, you need to add the domain for the URL as an authorized domain”* in the console **Security → Authentication → Settings → Authorized domains** ([passing state in email actions](https://firebase.google.com/docs/auth/web/passing-state-in-email-actions)).
- Redirect/sign-in errors: *“This domain YOUR_REDIRECT_DOMAIN is not authorized to run this operation”* if the domain is not listed or the API key is wrong ([Auth FAQ](https://firebase.google.com/docs/auth/faq-and-troubleshooting)).
- `continue_uri` must be in authorized domains when using a custom `authDomain` ([redirect best practices](https://firebase.google.com/docs/auth/web/redirect-best-practices)).
- ADR 0005 already records: authorized domains must include **localhost** and the **production origin**.

Add (hostname only, no path, no `https://` in the console field beyond what the UI asks):

| Domain | Why |
| --- | --- |
| `localhost` | `ng serve` (Firebase usually pre-seeds this) |
| Production Cloudflare hostname (Pages `*.pages.dev` and/or the custom domain) | SPA origin that calls Auth |
| Preview hosts (`*.pages.dev` aliases, `*.workers.dev`) | Only if those URLs must sign in or send reset mail |

`PROJECT_ID.firebaseapp.com` and `PROJECT_ID.web.app` are default Auth/Hosting domains. They stay, even though the app is not served from Firebase Hosting.

Authorized domains do **not** replace Storage CORS or Functions CORS.

## 6. Password-reset continue URL

Forgot-password uses Firebase’s reset email ([manage users](https://firebase.google.com/docs/auth/web/manage-users)):

```ts
sendPasswordResetEmail(auth, email, actionCodeSettings?)
```

[`ActionCodeSettings.url`](https://firebase.google.com/docs/reference/js/auth.actioncodesettings.md) is required if you pass settings. It is the **continue/state URL**, not the handler that consumes `oobCode`:

- Default emails link to the **Firebase Hosting** action widget (`https://<projectId>.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=…`) ([custom email handlers](https://firebase.google.com/docs/auth/custom-email-handler)).
- When that widget finishes, it sends the user to `url` as `continueUrl`.
- `url`’s **domain must be an authorized domain** or the send fails (`auth/unauthorized-continue-uri`).

For a web-only app, set `handleCodeInApp: false` (default): the code is handled on the web widget first, then continue goes to the app ([passing state](https://firebase.google.com/docs/auth/web/passing-state-in-email-actions)).

Two workable layouts:

1. **Keep the default handler** (simplest). `sendPasswordResetEmail(auth, email, { url: 'https://<cloudflare-origin>/' })`. User sets the new password on `firebaseapp.com`, then continues to the Cloudflare SPA. The continue URL must be authorized. Customize From-domain separately if desired ([custom domain for Auth emails](https://firebase.google.com/docs/auth/email-custom-domain)) — that is SPF/CNAME, not SPA hosting.
2. **Custom handler on Cloudflare** (matches “the app owns password recovery UX”). Host a route (e.g. `/reset`) that reads `mode`, `oobCode`, `apiKey`, `continueUrl`, `lang` and calls `verifyPasswordResetCode` / `confirmPasswordReset` ([custom email handlers](https://firebase.google.com/docs/auth/custom-email-handler)). In the console **Authentication → Templates → customize action URL**, point at `https://<cloudflare-origin>/reset`. That path needs the same SPA fallback as `/signup/:id`.

Do not put the Invitation GUID in the Auth continue URL. Invite links are minted by Functions; reset links are Auth oob codes.

## 7. Popup vs redirect on this host

[`signInWithPopup`](https://firebase.google.com/docs/reference/js/auth.md#signinwithpopup_770f816) / [`signInWithRedirect`](https://firebase.google.com/docs/reference/js/auth.md#signinwithredirect_770f816) are **OAuth** flows. Email/password is [`signInWithEmailAndPassword`](https://firebase.google.com/docs/auth/web/password-auth) — no popup, no redirect, no `/__/auth/handler`.

If we ever added a federated provider, hosting **off Firebase Hosting** is the hard case. [Redirect best practices](https://firebase.google.com/docs/auth/web/redirect-best-practices):

- Helper iframe talks to `authDomain` (default `<project>.firebaseapp.com`). Browsers that partition third-party storage break `signInWithRedirect`.
- **Option 1** (set `authDomain` to the app origin) requires the app to be on **Firebase Hosting** with that custom domain. We rejected Firebase Hosting.
- **Option 2**: `signInWithPopup` instead. Popups can be blocked; worse on mobile.
- **Option 3**: reverse-proxy `https://<app>/__/auth/` → `https://<project>.firebaseapp.com/__/auth/` (transparent, not a 302). Documented nginx snippet; a Cloudflare Worker or `_redirects` **cannot** proxy an external domain (`_redirects` proxy is relative-only).
- **Option 4**: self-host the helper files under `/__/auth/` on this origin.
- **Option 5**: provider SDK + `signInWithCredential`.

**For this host and this product: use neither popup nor redirect.** Sign-in is email/password. Password reset is an email action link (full page, not a popup). Do not set `authDomain` to the Cloudflare hostname unless we also serve `/__/auth/*` from that hostname (Options 3–4) or Hosting (rejected).

## 8. Implications for this repo (facts, not a product pick)

- Production artifact is `dist/floor-planner/browser`. Point Pages “build output directory” or Workers `assets.directory` at that folder. Copy `_headers` (and optional `_redirects`) via `public/`.
- SPA fallback must cover `/signup/:id` and whatever reset/settings routes the app adds. Invalid GUID 404 is Angular, after `index.html`.
- Port `deploy/nginx/security-headers.conf` into `_headers`, then **widen** `connect-src` / `img-src` as in §4. Today’s nginx CSP (`connect-src 'self'` only) would block Auth, Firestore, Storage, and Functions.
- After the Firebase project exists: add the Cloudflare hostname to Auth authorized domains; set Storage bucket CORS to that origin; set Function `cors` to that origin; put the concrete Functions URL in `connect-src`.
- `localhost` remains authorized for Auth; `ng serve` does not use `_headers` (no CSP unless added in `index.html` or a dev proxy).
- Preview deployments (`*.pages.dev` / Workers preview URLs) are extra origins: Auth, CORS, and CSP must list them if those URLs must talk to Firebase.

## Sources

Cloudflare:

- https://developers.cloudflare.com/pages/configuration/serving-pages/
- https://developers.cloudflare.com/pages/configuration/headers/
- https://developers.cloudflare.com/pages/configuration/redirects/
- https://developers.cloudflare.com/pages/framework-guides/deploy-an-angular-site/
- https://developers.cloudflare.com/pages/how-to/add-custom-http-headers/
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
- https://developers.cloudflare.com/workers/static-assets/headers/
- https://developers.cloudflare.com/workers/static-assets/redirects/
- https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/
- https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/angular/
- https://developers.cloudflare.com/fundamentals/reference/policies-compliances/content-security-policies/
- https://developers.cloudflare.com/rules/transform/response-header-modification/
- https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/

Firebase / Identity Platform / Cloud Storage:

- https://firebase.google.com/docs/auth/web/password-auth
- https://firebase.google.com/docs/auth/web/manage-users
- https://firebase.google.com/docs/auth/web/passing-state-in-email-actions
- https://firebase.google.com/docs/auth/custom-email-handler
- https://firebase.google.com/docs/auth/web/redirect-best-practices
- https://firebase.google.com/docs/auth/faq-and-troubleshooting
- https://firebase.google.com/docs/auth/email-custom-domain
- https://firebase.google.com/docs/auth/web/chrome-extension
- https://firebase.google.com/docs/reference/js/auth.actioncodesettings.md
- https://firebase.google.com/docs/reference/js/auth.md
- https://docs.cloud.google.com/identity-platform/docs/show-custom-domain
- https://firebase.google.com/docs/projects/api-keys
- https://firebase.google.com/docs/storage/web/start
- https://firebase.google.com/docs/storage/web/download-files
- https://docs.cloud.google.com/storage/docs/cross-origin
- https://firebase.google.com/docs/functions/callable
- https://firebase.google.com/docs/functions/http-events
- https://firebase.google.com/docs/functions/locations
