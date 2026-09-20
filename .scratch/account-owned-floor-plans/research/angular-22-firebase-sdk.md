# Angular 22 + Firebase Auth, Firestore, and Storage

Researched: 2026-09-20  
Ticket: How does Angular 22 talk to Firebase Auth, Firestore, and Storage?  
This repo: Angular `^22.1.0`, TypeScript `~6.0.2`, zoneless SPA (`provideZonelessChangeDetection` in `src/app/app.config.ts`), static host (Cloudflare, not SSR).

## Answer

Use the **modular `firebase` JS SDK** (`firebase` npm package, current latest `12.19.0`). Do **not** take `@angular/fire` as a required layer on Angular 22 today.

`@angular/fire` is a wrapper around that same SDK (DI, RxJS, zoneless-era PendingTasks wrapping, router guards). It is not a second client. As of this date it does not peer Angular 22: npm `latest` is `20.0.1` (Angular `^20`), npm `next` is `21.0.0-rc.0` (Angular `^21`). AngularFire 21’s own upgrade guide says it “does not support Angular 22 (a future AngularFire 22 will).” An open PR for v22 exists and is not merged.

Tree-shake by importing product modules (`firebase/app`, `firebase/auth`, `firebase/firestore`, `firebase/storage`). Auth default persistence on web is `local` (survives browser close). Firestore **web** persistence is **off** by default (`memoryLocalCache`); do not pass `persistentLocalCache` unless a later ticket says so. In this zoneless app, subscribe to Auth with `onAuthStateChanged` and write `User | null` into a signal (or `toSignal` / `AsyncPipe`); Firebase callbacks are not Angular template events and will not schedule change detection by themselves.

## Compatibility (2026-09-20)

| Layer | Supported on this SPA? | Evidence |
| --- | --- | --- |
| Modular `firebase` JS SDK (`12.19.0`) | Yes. Framework-agnostic; Angular CLI is a named bundler. | [Add Firebase to JS](https://firebase.google.com/docs/web/setup), [Understand Firebase for web](https://firebase.google.com/docs/web/learn-more), [Module bundlers](https://firebase.google.com/docs/web/module-bundling) |
| Namespaced / `firebase/compat/*` | No for a new app. New features go to the modular API. | [Understand Firebase for web](https://firebase.google.com/docs/web/learn-more#sdk-versions-namespaced-and-modular) |
| `@angular/fire@20.0.1` (`latest`) | No. Peers `@angular/* ^20.0.0`. | [npm `@angular/fire@20.0.1`](https://registry.npmjs.org/@angular/fire/20.0.1), [releases](https://github.com/angular/angularfire/releases/tag/20.0.1) |
| `@angular/fire@21.0.0-rc.0` (`next`) | No. Peers `@angular/* ^21.0.0`. Guide: Angular 21 required, not 22. | [npm `@angular/fire@21.0.0-rc.0`](https://registry.npmjs.org/@angular/fire/21.0.0-rc.0), [v21 upgrade guide](https://github.com/angular/angularfire/blob/main/docs/version-21-upgrade.md) |
| Future `@angular/fire` 22 | Not shipped. Issue [#3696](https://github.com/angular/angularfire/issues/3696) and PR [#3741](https://github.com/angular/angularfire/pull/3741) are open. Maintainer: v21 first, then v22. | [#3699](https://github.com/angular/angularfire/issues/3699) (comment 2026-07-09) |
| AngularFire `compat/*` | No. Old namespaced wrapper; not tree-shakable. | [compat.md](https://github.com/angular/angularfire/blob/main/docs/compat.md), [v7 upgrade](https://github.com/angular/angularfire/blob/main/docs/version-7-upgrade.md) |
| Forcing AngularFire with `--legacy-peer-deps` | Not a supported install. | Peer ranges above; [install-and-setup](https://github.com/angular/angularfire/blob/main/docs/install-and-setup.md) tells newest Angular majors to use `@next`, and `@next` still peers 21. |

Firebase lists AngularFire as a Firebase-maintained open-source library for Angular, not as the only way to call Firebase from an Angular app. The JS SDK is the product API. See [Add Firebase to JS → Next steps](https://firebase.google.com/docs/web/setup).

## What each package is

### Modular `firebase` JS SDK

The supported web client for Auth, Firestore, and Storage. Install `firebase`, then:

```ts
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
```

- Setup: [Add Firebase to your JavaScript project](https://firebase.google.com/docs/web/setup) (last updated 2026-09-17). Modular API is “strongly recommended, especially for production apps.”
- Auth: [Get started with Authentication on websites](https://firebase.google.com/docs/auth/web/start) — `getAuth(app)`, `signInWithEmailAndPassword`, `onAuthStateChanged`.
- Firestore: [Firestore quickstart](https://firebase.google.com/docs/firestore/quickstart) / [API](https://firebase.google.com/docs/reference/js/firestore_). `getFirestore(app)` uses default settings.
- Storage: [Get started with Cloud Storage on web](https://firebase.google.com/docs/storage/web/start) — `getStorage(app)`. Requires Blaze; bucket name in config (`PROJECT_ID.firebasestorage.app` for buckets created on/after Sept 2024).

The SDK is not Angular-versioned. Supported environments are browsers (Chrome, Firefox, Edge, Safari) plus other runtimes; Angular is not a special case. [Supported environments](https://firebase.google.com/docs/web/environments-js-sdk).

### `@angular/fire`

“Smooths over the rough edges an Angular developer might encounter when implementing the framework-agnostic Firebase JS SDK.” It re-exports the same modular functions from `@angular/fire/auth`, `@angular/fire/firestore`, `@angular/fire/storage`, wrapping each with `ɵzoneWrap`. Auth RxJS helpers `user`, `authState`, `idToken` are RxFire wrapped the same way.

- Repo README: [angular/angularfire](https://github.com/angular/angularfire)
- Auth guide: [docs/auth.md](https://github.com/angular/angularfire/blob/main/docs/auth.md) — “Update the imports from `firebase/auth` to `@angular/fire/auth` and follow the official documentation.”
- Firestore: [docs/firestore.md](https://github.com/angular/angularfire/blob/main/docs/firestore.md)
- Storage: [docs/storage.md](https://github.com/angular/angularfire/blob/main/docs/storage.md)
- Generated wrappers: [src/auth/firebase.ts](https://github.com/angular/angularfire/blob/main/src/auth/firebase.ts), [src/auth/rxfire.ts](https://github.com/angular/angularfire/blob/main/src/auth/rxfire.ts)
- Zone / zoneless wrapping: [docs/zones.md](https://github.com/angular/angularfire/blob/main/docs/zones.md)

AngularFire 19 added “Support for Zoneless Angular applications” and rebuilt wrappers on `PendingTasks` / injection context. The sample app is a zoneless SSR kitchen sink. That is AngularFire’s value (SSR stability, DI, lazy import of Firebase, `AsyncPipe` streams, auth guards) — not a different Auth/Firestore/Storage backend.

This SPA is client-rendered on Cloudflare. SSR PendingTasks, `initializeServerApp`, and Hosting cookie forwarding are out of scope here.

v21 upgrade guide, “Other notes”:

> Angular 21 is required. AngularFire 21 peers `@angular/* ^21.0.0` and does not support Angular 22 (a future AngularFire 22 will).

Source: [docs/version-21-upgrade.md](https://github.com/angular/angularfire/blob/main/docs/version-21-upgrade.md)

Install docs say if `ng add @angular/fire` hits a peer conflict on a newer Angular major, use `@next`. `@next` is still `21.0.0-rc.0`. Source: [docs/install-and-setup.md](https://github.com/angular/angularfire/blob/main/docs/install-and-setup.md).

Maintainer Armando Navarro, 2026-07-09 on [#3699](https://github.com/angular/angularfire/issues/3699): tasked with getting AngularFire back in sync, “starting with v21, and will move to v22 after that.” Zone wrapping rebuilt on zoneless-era primitives; zoneless is now Angular’s default; AngularFire still claims PendingTasks, injection-context preservation, DI, lazy loading, observables, router guards.

Community PR [#3741](https://github.com/angular/angularfire/pull/3741) (opened 2026-08-11, last push 2026-08-21) bumps peers to Angular 22 / TypeScript 6. Not merged as of 2026-09-20.

**Implication:** wait for a published AngularFire 22 (or a documented `@next` that peers `^22`) before adding the wrapper. The modular SDK does not need that wait.

## Tree-shaking

The modular API exists to tree-shake. Namespaced/`compat` does not get the same size cut.

- [Understand Firebase for web](https://firebase.google.com/docs/web/learn-more): modular SDK “integrates well with build tools that strip out code that isn't being used”; namespaced “does not provide the same degree of size reduction.” New apps should adopt modular. “We do not recommend creating a new Firebase app with namespaced API libraries.”
- [Modular upgrade](https://firebase.google.com/docs/web/modular-upgrade): tree-shaking can be “80% less kilobytes” vs namespaced, depending on the app. Compat is a migration bridge, not the destination.
- [Module bundlers](https://firebase.google.com/docs/web/module-bundling): unused imports such as `getRedirectResult` stay out of the bundle. Angular CLI is listed with webpack, Rollup, and esbuild.
- [Add Firebase to JS, step 4](https://firebase.google.com/docs/web/setup): skip manual bundler config if using Angular CLI; it “automatically handle[s] module bundling.”
- Auth extra: [Customize Auth dependencies](https://firebase.google.com/docs/auth/web/custom-dependencies). `getAuth()` on browser is equivalent to `initializeAuth` with `[indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence]` and `browserPopupRedirectResolver`. Email/password-only apps can `initializeAuth` with `browserLocalPersistence` (or IndexedDB) and omit `popupRedirectResolver` to drop popup/redirect code. This app rejected Google sign-in and anonymous Auth, so that trim is available.

AngularFire’s modular entry points are the same functions, re-exported and wrapped. Compat AngularFire is “not as tree-shakable as the new modular SDK” ([v7 upgrade](https://github.com/angular/angularfire/blob/main/docs/version-7-upgrade.md)).

Do not import `firebase/compat/*` or `@angular/fire/compat/*`.

## Auth persistence

Do not confuse Auth persistence with Firestore disk cache. Firebase says so explicitly: [Auth state persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence) (last updated 2026-09-17).

Web types (modular names in parentheses):

| Type | Modular symbol | Behavior |
| --- | --- | --- |
| `local` | `indexedDBLocalPersistence` / `browserLocalPersistence` | Survives tab/window close. Explicit `signOut` clears it. Default on web/React Native. Single-origin. |
| `session` | `browserSessionPersistence` | Current tab only; cleared when that tab/window closes. |
| `none` | `inMemoryPersistence` | Memory only; cleared on refresh. Default on Node. |

Change with `setPersistence(auth, browserSessionPersistence)` (etc.) **before** the sign-in that should use it.

`getAuth()` on a browser uses the `local` stack (IndexedDB, then `localStorage`, then session). That matches this product: optional sign-in, Account remembered until explicit sign-out, owned Floor plans restored from last Save after reload.

Override only if a later ticket wants tab-scoped or memory-only sessions (shared kiosk, “remember me” off). Email/password does not need `browserPopupRedirectResolver`.

## Firestore `persistentLocalCache`

[Access data offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline) (last updated 2026-09-17):

- Android/Apple: persistence **on** by default.
- **Web: persistence off by default.** Enable only by configuring `localCache` on `initializeFirestore`.
- Web persistence: Chrome, Safari, Firefox only.
- Cache is **not** cleared between sessions. Docs: if the web app handles sensitive information, ask whether the device is trusted before enabling.

Modular web options:

```ts
initializeFirestore(app); // memory cache (default)
initializeFirestore(app, { localCache: memoryLocalCache() });
initializeFirestore(app, { localCache: persistentLocalCache(/*settings*/{}) });
initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
```

`getFirestore(app)` “initializes a new instance with default settings” if none exists — web default is memory, not IndexedDB. [getFirestore](https://firebase.google.com/docs/reference/js/firestore_.md#getfirestore). `initializeFirestore` must run before any other Firestore call.

Older `enablePersistence` / `enableIndexedDbPersistence` are the namespaced path. Prefer `localCache` on `initializeFirestore` if persistence is ever enabled.

**This ticket:** do not enable `persistentLocalCache`. `getFirestore(app)` is enough. Product already keeps the unsigned Floor plan in the app’s own IndexedDB and treats cloud Save/Open as explicit; a second Firestore disk cache would not be the unsigned store and is not needed for catalog CRUD. Revisit only if a later ticket asks.

`clearIndexedDbPersistence` is a test helper; docs warn not to treat it as a secure wipe, and recommend not enabling persistence if cached data between sessions is sensitive.

## How a zoneless app subscribes to Auth state

This app already calls `provideZonelessChangeDetection()`. Angular v21+ is zoneless by default; v22 makes `OnPush` the default strategy. [Zoneless](https://angular.dev/guide/zoneless), [provideZonelessChangeDetection](https://angular.dev/api/core/provideZonelessChangeDetection), [v22 change-detection notes](https://blog.angular.dev/announcing-angular-v22-c52bb83a4664).

Zoneless CD runs when:

- `ChangeDetectorRef.markForCheck` (including `AsyncPipe`)
- `ComponentRef.setInput`
- a signal read in a template updates
- a bound host/template listener runs
- a view marked dirty by one of the above is attached

A Firebase Auth callback is **none of those**. `onAuthStateChanged` will update SDK state and your JS variables; the template will not refresh unless you notify Angular.

### Supported pattern (modular SDK, this SPA)

```ts
import { signal } from '@angular/core';
import { getAuth, onAuthStateChanged, type User } from 'firebase/auth';

const auth = getAuth(app);
const account = signal<User | null>(null);

const unsubscribe = onAuthStateChanged(auth, (user) => {
  account.set(user); // schedules CD for templates that read account()
});
```

- First callback is the restored `local` session (`User`) or signed-out (`null`).
- Later callbacks: sign-in, sign-out. (`onIdTokenChanged` also fires on token refresh; `onAuthStateChanged` does not. Use `user.getIdToken()` when a Functions call needs a fresh JWT.)
- Unsubscribe on destroy (or wrap once at app root).

Alternatives that also notify zoneless CD:

- `toSignal` from `@angular/core/rxjs-interop` on an Observable of auth state ([toSignal](https://angular.dev/api/core/rxjs-interop/toSignal)).
- `AsyncPipe` on that Observable (`markForCheck`).

Do not assign `this.user = user` on an `OnPush` / default-v22 component and expect the view to update.

### If AngularFire 22 ships later

From [docs/auth.md](https://github.com/angular/angularfire/blob/main/docs/auth.md):

- `authState(auth)` — sign-in / sign-out
- `user(auth)` — those plus token refresh
- `idToken(auth)` — token string or `null`

Those are zone-wrapped RxFire observables. Bind with `AsyncPipe` or `toSignal`. Call them in an injection context (constructor / field initializer), or `runInInjectionContext`, or AngularFire skips wrapping and warns ([zones.md](https://github.com/angular/angularfire/blob/main/docs/zones.md)). Default zoneless log level is Silent.

AngularFire wrapping is “inconsequential” for one-shot promises kicked off by user input (sign-in, `addDoc`, Storage upload). Long-lived listeners (`onAuthStateChanged`, `onSnapshot`) are the case that needs a CD notification. Writing a signal covers that without AngularFire.

`NgZone.run` / `runOutsideAngular` remain legal under zoneless but are unnecessary if Auth state is a signal.

## What to install (when implementation starts)

```text
pnpm add firebase
```

Then initialize once (app config or a small core factory): `initializeApp(firebaseConfig)`, `getAuth(app)`, `getFirestore(app)`, `getStorage(app)`.

Optional Auth size trim for email/password only:

```ts
import { initializeAuth, indexedDBLocalPersistence } from 'firebase/auth';

const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
```

Do not add `@angular/fire` until a published release peers `@angular/* ^22`. Do not add `firebase/compat`. Do not call `initializeFirestore(..., { localCache: persistentLocalCache() })` unless a later ticket says so.

## Sources

Firebase (docs last updated 2026-09-17 unless noted):

- https://firebase.google.com/docs/web/setup
- https://firebase.google.com/docs/web/learn-more
- https://firebase.google.com/docs/web/modular-upgrade
- https://firebase.google.com/docs/web/module-bundling
- https://firebase.google.com/docs/web/environments-js-sdk
- https://firebase.google.com/docs/auth/web/start
- https://firebase.google.com/docs/auth/web/auth-state-persistence
- https://firebase.google.com/docs/auth/web/custom-dependencies
- https://firebase.google.com/docs/reference/js/auth.md
- https://firebase.google.com/docs/firestore/manage-data/enable-offline
- https://firebase.google.com/docs/reference/js/firestore_.md
- https://firebase.google.com/docs/storage/web/start

AngularFire:

- https://github.com/angular/angularfire
- https://github.com/angular/angularfire/blob/main/docs/install-and-setup.md
- https://github.com/angular/angularfire/blob/main/docs/auth.md
- https://github.com/angular/angularfire/blob/main/docs/firestore.md
- https://github.com/angular/angularfire/blob/main/docs/storage.md
- https://github.com/angular/angularfire/blob/main/docs/zones.md
- https://github.com/angular/angularfire/blob/main/docs/version-21-upgrade.md
- https://github.com/angular/angularfire/blob/main/src/auth/firebase.ts
- https://github.com/angular/angularfire/blob/main/src/auth/rxfire.ts
- https://github.com/angular/angularfire/releases
- https://github.com/angular/angularfire/issues/3696
- https://github.com/angular/angularfire/issues/3699
- https://github.com/angular/angularfire/issues/3737
- https://github.com/angular/angularfire/pull/3741
- https://www.npmjs.com/package/@angular/fire (dist-tags: `latest` 20.0.1, `next` 21.0.0-rc.0)

Angular:

- https://angular.dev/guide/zoneless
- https://angular.dev/api/core/provideZonelessChangeDetection
- https://angular.dev/api/core/rxjs-interop/toSignal
- https://blog.angular.dev/announcing-angular-v22-c52bb83a4664
