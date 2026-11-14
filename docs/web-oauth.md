# Web OAuth setup

Never put client secrets in source, frontend variables, chat, screenshots, or shell
command arguments. The phone's `~/cw-dojo/private.env` is mode 0600. The owner-run
`python ~/cw-dojo/configure-oauth.py` accepts secrets with hidden input, preserves
blank values, and restarts only Dojo. The backend enables each provider only when
both its client ID and secret are present. Refresh the website after changing them.

## GitHub

A new OAuth application named **Dih Dah Dojo** is registered under the owner's
account. Application settings: https://github.com/settings/applications/4019885.

- Homepage: `https://dojo.veryshyjelly.in`
- Redirect: `https://dojoapi.veryshyjelly.in/api/auth/callback/github`
- No wildcard redirect or device flow.

The owner generated and entered the secret privately. The API reports GitHub ready.
Complete one live sign-in to verify credential exchange, callback cookies, and the
return to the studio. Dojo needs the account profile and email, not repository access.

## Google

Create a separate **Dih Dah Dojo** project in [Google Cloud Console](https://console.cloud.google.com/).
No billing account, trial, paid API, or service-account key is needed for this flow.
Configure **Google Auth Platform** branding with the app name and an owner-controlled
support/contact email. Choose **External** audience for a public trainer. Request
only the basic OpenID profile/email identity scopes used by Better Auth. The public
privacy information URL is `https://dojo.veryshyjelly.in/privacy`.

In **Branding**, set:

| Field | Value |
| --- | --- |
| App name | `Dih Dah Dojo` |
| Support/developer contact | Your own monitored email |
| Homepage | `https://dojo.veryshyjelly.in` |
| Privacy policy | `https://dojo.veryshyjelly.in/privacy` |
| Authorized domain | `veryshyjelly.in` |

The logo and Terms of Service URL can stay empty for the initial setup.
Under **Clients**, create a **Web application** named **Dih Dah Dojo Web**:

| Field | Value |
| --- | --- |
| Authorized JavaScript origin | `https://dojo.veryshyjelly.in` |
| Authorized redirect URI | `https://dojoapi.veryshyjelly.in/api/auth/callback/google` |

Copy the secret privately when Google first displays it; it may not be shown again.
The owner must complete credential creation and enter the client ID/secret with the
phone helper. Press Enter through the GitHub prompts to retain its configuration.
Start with the Testing audience and add your own Google account as a test user if
the field is offered. Google currently makes an allowlist exception for basic
identity-only scopes; Testing is still a development configuration. Complete Google's
required publication/verification steps before representing the Google login as
production-ready. Do not request sensitive API scopes or enable unrelated APIs.

Callbacks follow [Better Auth's provider contract](https://www.better-auth.com/docs/concepts/oauth).
Google's [web-server OAuth documentation](https://developers.google.com/identity/protocols/oauth2/web-server)
explains exact redirect matching and consent configuration.
