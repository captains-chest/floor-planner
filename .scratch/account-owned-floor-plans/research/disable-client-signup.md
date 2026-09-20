# How is client email/password registration disabled?

Ticket: `.scratch/account-owned-floor-plans/issues/02-disable-client-signup.md`
Product constraints (accepted): email/password sign-in; no public `createUserWithEmailAndPassword`; Accounts created only by Admin SDK on Invitation redeem (plus one console-seeded operator). Anonymous Auth stays off. Email enumeration protection is on for a new project (ADR 0005).

This note records what **primary Firebase / Identity Platform docs** actually say. It does not pick the product mechanism (that is issue 09).

## Bottom line

| Mechanism | Stops client `createUserWithEmailAndPassword`? | Leaves `signInWithEmailAndPassword`? | Leaves Admin `createUser` and console seed? | Leaves password reset? |
| --- | --- | --- | --- | --- |
| Identity Platform **disable end-user signup** (`client.permissions.disabledUserSignup`) | Yes. Client gets `auth/admin-restricted-operation`. | Yes (sign-in is not signup). | Yes. Docs name Admin SDK and console as the remaining create paths. | Yes. Reset is not a signup API. |
| Blocking `beforeCreate` / `beforeUserCreated` | Yes, if the function throws. Requires Identity Platform. | Yes, unless you also block `beforeSignIn`. | **Not documented.** Primary docs describe a client registration/sign-in hook and never list Admin SDK as a `beforeCreate` trigger (unlike background `onCreate`). | `beforeEmail` can run on the reset mail. `beforeCreate` does not. |
| Console **Sign-in method**: leave Email/Password **off** | Yes (`auth/operation-not-allowed` / `OPERATION_NOT_ALLOWED`). | **No.** Sign-in uses the same provider. | Admin create with a password can fail `auth/operation-not-allowed` if the provider is disabled. | Confirming a reset fails `OPERATION_NOT_ALLOWED` when password sign-in is disabled. |
| Console **User actions** pane | The pane is where Identity Platform **User self-service** and **email enumeration protection** live. The documented signup kill-switch is Identity Platform settings / `disabledUserSignup`, not a separate Firebase-Auth-only toggle. | n/a | n/a | EEP changes reset *errors*, not whether reset exists. |

For this product, the documented match is: **upgrade to Firebase Authentication with Identity Platform, enable Email/Password, keep Anonymous off, set `disabledUserSignup: true` (and leave EEP on).** Blocking `beforeCreate` is an extra client-side gate, not the documented Admin-vs-client split. Turning the Email/Password provider off is not viable.

## 1. Identity Platform: disable end-user signup

This is the mechanism the Identity Platform docs describe for “admins create accounts; clients must not.”

[Identity Platform: users in projects — User self-service](https://cloud.google.com/identity-platform/docs/concepts-manage-users):

> By default, Identity Platform enables users to sign-up and delete their accounts without administrative intervention.
>
> There are situations, however, where you want users to be manually or programmatically created by an administrator, either using the Admin SDK or Google Cloud console. In these cases, you can disable user actions from the Identity Platform settings page, which prevents account creation and deletion by an end-user.

Client error when they try anyway:

- Web: `auth/admin-restricted-operation`
- Android / iOS: `ERROR_ADMIN_RESTRICTED_OPERATION`

The JS SDK maps that code as `ADMIN_ONLY_OPERATION: "auth/admin-restricted-operation"` ([AuthErrorCodes](https://firebase.google.com/docs/reference/js/auth#autherrorcodes)).

The setting is `Config.client.permissions.disabledUserSignup` on the Identity Toolkit v2 config:

> When true, end users cannot sign up for a new account on the associated project through any of our API methods.

Sources:

- [Config REST — Permissions](https://cloud.google.com/identity-platform/docs/reference/rest/v2/Config)
- Same field on tenants: [projects.tenants](https://cloud.google.com/identity-platform/docs/reference/rest/v2/projects.tenants)
- Tenant walkthrough (HTTP PATCH): [Authenticating with multi-tenancy — Disabling end-user account creation and deletion](https://cloud.google.com/identity-platform/docs/multi-tenancy-authentication)

Project-level (no tenants) is the same `client.permissions` object on `projects/{projectId}/config`. Tenant projects must set it per tenant.

This is **not** in base Firebase Authentication. Blocking functions, User self-service, and the Identity Platform settings page require the Identity Platform upgrade ([product comparison](https://cloud.google.com/identity-platform/docs/product-comparison); [Firebase Auth — Identity Platform](https://firebase.google.com/docs/auth#identity-platform)). Upgrade is one click on [Authentication Settings](https://console.firebase.google.com/project/_/authentication/settings). Blaze is already required for Storage; Identity Platform on Blaze bills MAUs after 50,000 ([pricing note on the Auth overview](https://firebase.google.com/docs/auth#identity-platform)).

What this does **not** disable: Email/Password as a sign-in provider, `signInWithEmailAndPassword`, Admin `createUser`, console Users tab create, or password-reset OOB. Those are separate APIs.

## 2. Blocking `beforeCreate`

Blocking functions are a **client registration / sign-in interceptor**. They require Identity Platform ([extend with blocking functions](https://firebase.google.com/docs/auth/extend-with-blocking-functions); [Auth blocking triggers](https://firebase.google.com/docs/functions/auth-blocking-events); [Identity Platform blocking functions](https://cloud.google.com/identity-platform/docs/blocking-functions)).

Documented events:

- **beforeCreate / beforeUserCreated** — “Triggers before a new user is saved … and before a token is returned to your **client app**.”
- **beforeSignIn / beforeUserSignedIn** — after credentials are verified, before an ID token is returned. Creating a new user also runs this.
- **beforeEmail** (Node.js only) — before a sign-in or **password reset** email is sent.
- **beforeSms** (Node.js only) — SMS / MFA.

Throwing `HttpsError` from `beforeCreate` rejects client `createUserWithEmailAndPassword`. The sample is exactly that call. Errors wrap as `auth/internal-error` with a Cloud Function message, not `auth/admin-restricted-operation`.

Documented **non-triggers**:

> Anonymous and custom authentication do not trigger blocking functions.

(Identity Platform: “don't support blocking functions.”)

Documented **gotcha**: if you delete the function but leave the trigger registered, **all users fail to authenticate**.

Timeout: the function must respond within 7 seconds or the client operation fails.

`beforeCreate` is the documented way to reject *specific* client signups (domain allowlist, unverified email). It is **not** documented as the Admin-vs-client split. ADR 0008 already rejected “email allowlist in `beforeCreate`” as a product design (knowing the email is enough); that is independent of whether `beforeCreate` can throw for every client.

## 3. Not enabling the Email/Password provider

[Password auth — Before you begin](https://firebase.google.com/docs/auth/web/password-auth): enable **Email/password** under Sign-in method, or `createUserWithEmailAndPassword` / `signInWithEmailAndPassword` cannot work.

Client REST `accounts:signUp` with email+password: `OPERATION_NOT_ALLOWED: Password sign-in is disabled for this project` ([Auth REST](https://firebase.google.com/docs/reference/rest/auth); [accounts.signUp](https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signUp)).

Client SDK: `auth/operation-not-allowed` — “Thrown if email/password accounts are not enabled” ([compat Auth.createUserWithEmailAndPassword](https://firebase.google.com/docs/reference/node/firebase.auth.Auth#createuserwithemailandpassword)).

Admin SDK: `auth/operation-not-allowed` — “The provided sign-in provider is disabled for your Firebase project” ([Admin Auth errors](https://firebase.google.com/docs/auth/admin/errors)).

Password reset **confirm** (`accounts:resetPassword`): `OPERATION_NOT_ALLOWED: Password sign-in is disabled for this project` ([Auth REST](https://firebase.google.com/docs/reference/rest/auth)).

So disabling the provider is a blunt instrument: it turns off signup, **sign-in**, reset completion, and can block Admin password users. It does not match “email/password sign-in, invite-only create.”

## 4. Console settings (what actually exists)

There is no Firebase Auth console toggle that means “Email/Password sign-in on, client signup off” **except** Identity Platform User self-service / `disabledUserSignup`.

Documented console surfaces:

| Location | What it actually controls |
| --- | --- |
| **Security → Authentication → Sign-in method** | Enable/disable Email/Password, Anonymous, federated providers. ([password-auth](https://firebase.google.com/docs/auth/web/password-auth), [anonymous-auth](https://firebase.google.com/docs/auth/web/anonymous-auth), [CLI providers](https://firebase.google.com/docs/auth/configure-providers-cli)) |
| **Security → Authentication → Settings → User actions** | Documented in Firebase Auth docs for **email enumeration protection** ([password-auth](https://firebase.google.com/docs/auth/web/password-auth); [EEP guide](https://cloud.google.com/identity-platform/docs/admin/email-enumeration-protection)). Identity Platform documents the same settings page as the place to **disable user signup/deletion**. |
| **Security → Authentication → Users** | Operator can create a password user (console seed). ([Manage users](https://firebase.google.com/docs/auth/web/manage-users)) |
| Identity Platform **Settings** (GCP) | User self-service, blocking-function triggers. ([concepts-manage-users](https://cloud.google.com/identity-platform/docs/concepts-manage-users); [blocking functions](https://cloud.google.com/identity-platform/docs/blocking-functions)) |

Base Firebase Auth (no Identity Platform) does **not** document a signup-only kill-switch.

## 5. What still runs for Admin `createUser`

Admin `createUser` is the documented server create path ([Manage users](https://firebase.google.com/docs/auth/admin/manage-users); [Identity Platform manage users](https://cloud.google.com/identity-platform/docs/admin/manage-users)):

- Sets email, password (min 6 chars), `displayName`, `emailVerified`, `disabled`, optional `uid`.
- “Create new users without any throttling or rate limiting.”
- “Creating new users programmatically avoids some restrictions placed on end users. You aren't subject to throttling or rate limiting, and can bypass the normal verification process for emails and phone numbers.”
- Console Users tab is the other admin path ([Manage users in Firebase](https://firebase.google.com/docs/auth/web/manage-users)).

**Background `onCreate` / `onUserCreated` does run** for Admin create. Documented triggers ([Auth events](https://firebase.google.com/docs/functions/auth-events)):

- A user creates an email account and password.
- First federated sign-in.
- **The developer creates an account using the Admin SDK.**
- First anonymous session.

Not triggered: first sign-in with a custom token.

**Blocking `beforeCreate` is not listed** as an Admin trigger. The event is defined as running before a token is returned to the **client app**. Documented exceptions are anonymous and custom auth only. Primary docs do not say Admin `createUser` is skipped; they also do not say it is included. Treat that as a **documented gap**. Do not rely on `beforeCreate` as the thing that lets redeem through while blocking the client — that is what `disabledUserSignup` is for.

Admin create still needs the Email/Password provider enabled if the Account has a password (`auth/operation-not-allowed` otherwise). Duplicate email: `auth/email-already-exists`.

Admin create does **not** sign the client in. Redeem must either return a custom token / session, or the invitee signs in afterwards with `signInWithEmailAndPassword`.

## 6. What still runs for password reset

Forgot-password is a **client** flow on an **existing** Account. It is not `createUserWithEmailAndPassword`.

Still available with Email/Password enabled and `disabledUserSignup` true:

1. Client `sendPasswordResetEmail(auth, email)` ([Manage users](https://firebase.google.com/docs/auth/web/manage-users); [JS sendPasswordResetEmail](https://firebase.google.com/docs/reference/js/auth#sendpasswordresetemail)).
2. REST `POST …/accounts:sendOobCode` with `requestType: "PASSWORD_RESET"` ([Auth REST](https://firebase.google.com/docs/reference/rest/auth); [accounts.sendOobCode](https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/sendOobCode)).
3. User opens the link; `confirmPasswordReset` / `accounts:resetPassword`.
4. Console can also send a reset email ([Manage users](https://firebase.google.com/docs/auth/web/manage-users)).

If a **blocking `beforeEmail`** is registered, it runs before the reset email is sent ([blocking functions](https://firebase.google.com/docs/auth/extend-with-blocking-functions)). `beforeCreate` does not.

Reset **confirm** requires the Email/Password provider to stay enabled (`OPERATION_NOT_ALLOWED` if it is off).

Templates: **Security → Authentication → Templates**.

## 7. Email enumeration protection (keep on)

[Enable or disable email enumeration protection](https://cloud.google.com/identity-platform/docs/admin/email-enumeration-protection):

- Projects created **on or after 15 September 2023**: EEP **on by default**. Leave it on.
- Console: Authentication Settings → User actions → “Email enumeration protection (recommended).”
- REST: `emailPrivacyConfig.enableImprovedEmailPrivacy`.

When EEP is on:

| API | Behavior |
| --- | --- |
| Sign-in with unknown email / wrong password | `INVALID_LOGIN_CREDENTIALS` / `auth/invalid-credential`, not `EMAIL_NOT_FOUND`. |
| Client signup of an email that already exists | Still `EMAIL_EXISTS` (docs call this out; App Check / reCAPTCHA / **disallowing client signup** are the mitigations). |
| `sendPasswordResetEmail` | **Does not throw** when the email is unknown. Mail is sent **only if the address exists**. No “not found” error. ([JS sendPasswordResetEmail](https://firebase.google.com/docs/reference/js/auth#sendpasswordresetemail); EEP guide) |
| `fetchSignInMethodsForEmail` | Always empty; do not use it. |
| `updateEmail` | Blocked; use `verifyBeforeUpdateEmail`. |
| Linking anonymous → email/password via `linkWithCredential(EmailAuthCredential)` | Broken on older SDKs; REST `signUp` with `idToken` is the replacement. |

Forgot-password UX must **always** look like “if that email has an Account, we sent mail.” Do not branch on existence. Wrong-password UX must not say “no such email.”

EEP does **not** disable `createUserWithEmailAndPassword`. Existing-email signup still returns `EMAIL_EXISTS`, which is itself an enumeration signal — another reason to disable client signup rather than leave it open and hide errors.

## 8. Anonymous Auth (must stay off)

[Anonymous auth](https://firebase.google.com/docs/auth/web/anonymous-auth): `signInAnonymously` creates a real Auth user. Same REST endpoint as email signup: `accounts:signUp` with no email/password ([Auth REST](https://firebase.google.com/docs/reference/rest/auth)). Error if the provider is off: `OPERATION_NOT_ALLOWED: Anonymous user sign-in is disabled for this project`.

Gotchas if it were on:

1. **Blocking functions do not run** for anonymous (or custom) auth. A `beforeCreate` that rejects every email signup would **not** catch `signInAnonymously`.
2. Background `onCreate` **does** run for the first anonymous session.
3. An anonymous user can be **upgraded** with `linkWithCredential(EmailAuthProvider.credential(email, password))` — that is a client path to a password Account that is not `createUserWithEmailAndPassword`. Identity Platform notes that linking **email/password** does not re-trigger `beforeSignIn` ([blocking functions](https://cloud.google.com/identity-platform/docs/blocking-functions)).
4. EEP + old SDKs: linking anonymous to email is broken (Android &lt; 22.3.0, iOS &lt; 10.18.0, Web &lt; 10.6.0).
5. Identity Platform can auto-delete anonymous users after 30 days; that is irrelevant if the provider stays off.
6. `disabledUserSignup` is “any of our API methods” for end-user signup; anonymous `accounts:signUp` is a signup API. Do not use that as a reason to leave Anonymous enabled. Keep the provider off as a separate control.

Guest drawing in this product is **not** an anonymous Auth user (ADR 0005 / 0006). Unsigned work stays in IndexedDB.

## 9. Other client create paths to keep shut

`createUserWithEmailAndPassword` is not the only client create:

- REST `POST …/accounts:signUp` with the **web API key** (same as the JS SDK). `disabledUserSignup` is the documented block on “any of our API methods.”
- First-time federated sign-in creates a user. Leave Google and other IdPs off (ADR 0005).
- Email-link sign-in is a second Email/Password sub-provider; leave it off unless a later ticket says otherwise. `sendSignInLinkToEmail` is a different OOB type from `PASSWORD_RESET`.
- Custom tokens: `signInWithCustomToken` does **not** create a user and does **not** fire `onCreate`. Custom auth also skips blocking functions. Redeem should use Admin `createUser` (which creates the record), not “mint a custom token for an email that does not exist yet.”

## 10. Implications for invite redeem

Redeem Cloud Function (Admin SDK):

1. `getAuth().createUser({ email, password, displayName, … })` — not throttled as a client signup; not blocked by `disabledUserSignup`.
2. Background `onUserCreated` will fire if deployed; keep it side-effect-safe (do not consume the Invitation there; redeem is already the writer).
3. Do not depend on `beforeCreate` allowing Admin create. If a blocking function is deployed that throws for every create, **primary docs do not promise Admin redeem still works.**
4. After create, the client signs in with `signInWithEmailAndPassword` (provider stays enabled) or the Function mints a custom token for an **already created** user.
5. Duplicate email: Admin `auth/email-already-exists` — product maps this to “that email already has an Account; use Forgot password.”

Client bundle:

- Call `signInWithEmailAndPassword` and `sendPasswordResetEmail`.
- Do **not** call `createUserWithEmailAndPassword` (defense in depth; the server setting is the real control).
- Catch `auth/admin-restricted-operation` if any stray client signup remains.
- Forgot-password: always succeed-looking under EEP.

## Sources (primary)

- [Firebase Authentication (Identity Platform upgrade)](https://firebase.google.com/docs/auth#identity-platform)
- [Identity Platform vs Firebase Authentication](https://cloud.google.com/identity-platform/docs/product-comparison)
- [Identity Platform users — User self-service](https://cloud.google.com/identity-platform/docs/concepts-manage-users)
- [Config.client.permissions.disabledUserSignup](https://cloud.google.com/identity-platform/docs/reference/rest/v2/Config)
- [Disable signup per tenant](https://cloud.google.com/identity-platform/docs/multi-tenancy-authentication)
- [Extend Auth with blocking functions](https://firebase.google.com/docs/auth/extend-with-blocking-functions)
- [Auth blocking triggers](https://firebase.google.com/docs/functions/auth-blocking-events)
- [Identity Platform blocking functions](https://cloud.google.com/identity-platform/docs/blocking-functions)
- [Auth background triggers (`onCreate` includes Admin SDK)](https://firebase.google.com/docs/functions/auth-events)
- [Admin manage users (`createUser`)](https://firebase.google.com/docs/auth/admin/manage-users)
- [Identity Platform admin manage users](https://cloud.google.com/identity-platform/docs/admin/manage-users)
- [Admin Auth errors (`operation-not-allowed`)](https://firebase.google.com/docs/auth/admin/errors)
- [Password auth (enable provider, EEP, User actions)](https://firebase.google.com/docs/auth/web/password-auth)
- [Manage users (console create, `sendPasswordResetEmail`)](https://firebase.google.com/docs/auth/web/manage-users)
- [JS `createUserWithEmailAndPassword`](https://firebase.google.com/docs/reference/js/auth#createuserwithemailandpassword)
- [JS `sendPasswordResetEmail` (EEP: no throw if unknown)](https://firebase.google.com/docs/reference/js/auth#sendpasswordresetemail)
- [JS `signInWithEmailAndPassword` (EEP: `auth/invalid-credential`)](https://firebase.google.com/docs/reference/js/auth#signinwithemailandpassword)
- [JS `fetchSignInMethodsForEmail` (empty under EEP)](https://firebase.google.com/docs/reference/js/auth#fetchsigninmethodsforemail)
- [AuthErrorCodes `auth/admin-restricted-operation`](https://firebase.google.com/docs/reference/js/auth#autherrorcodes)
- [Auth REST (`signUp`, anonymous `signUp`, `sendOobCode`, `resetPassword`)](https://firebase.google.com/docs/reference/rest/auth)
- [accounts.signUp](https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signUp)
- [accounts.sendOobCode](https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/sendOobCode)
- [Email enumeration protection](https://cloud.google.com/identity-platform/docs/admin/email-enumeration-protection)
- [Anonymous auth](https://firebase.google.com/docs/auth/web/anonymous-auth)
- [Configure providers (CLI)](https://firebase.google.com/docs/auth/configure-providers-cli)
