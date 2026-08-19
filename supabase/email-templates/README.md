# Auth email templates

Everything in this folder is **configuration, not code**. No migration captures
it, nothing in the build reads it, and Supabase serves these from its dashboard.
If a project is ever rebuilt, they have to be pasted back in by hand. That is
exactly why they are committed here.

The SMTP half — sender, host, credentials, rate limits — is in
[../README.md](../README.md), under *SMTP — Phase 4*. This file is the message
bodies only.

---

## ⚠️ The files contain no HTML comments, and must not

Found the hard way on 2026-08-19. The templates originally opened with a header
comment explaining their construction. Pasted into the dashboard, **Supabase
ignored the template entirely** and sent its own built-in mail — subject and
body both — with no error anywhere. The dashboard showed the custom template
saved, a hard reload confirmed it had persisted, and every send was still the
default.

**Why.** Go's `html/template` elides HTML comments at parse time, and those
comments contained live template actions: `{{ .ConfirmationURL }}`,
`{{ .SiteURL }}`, `{{ .Data }}` and others, written as prose examples. Go does
not know an HTML comment from any other text — it parses the whole string — so
those were real actions in a context the parser strips. The template failed, and
GoTrue fell back to its built-in.

**The tell that located it:** the *subject* was default too. Subject and body are
stored and rendered separately, so a body that merely rendered badly would still
have carried the custom subject. Both being default meant the template record
was not being used at all, which pointed away from the HTML and at the parse.

**So all reasoning about these files lives in this README**, and the `.html`
files are paste-the-whole-thing. Do not add a comment back, however tempting —
not even a harmless prose one. The rule is easier to keep than the exception is
to remember.

## Where they go

Dashboard → **Authentication → Emails**, one tab per template. Paste the file
contents into the message body and set the subject.

⚠️ **These are the subjects production is actually sending**, read back from the
`Subject:` headers of real emails on 2026-08-19 — not what anyone intended to
type. Keep it that way: this table is the only record if a project is rebuilt,
and a subject nobody verified is a subject nobody has.

| Tab | File | Subject |
|---|---|---|
| Confirm signup | [`confirm-signup.html`](confirm-signup.html) | `👋 Welcome to Amplified Thinker: One step to confirm and activate your account` |
| Reset Password | [`reset-password.html`](reset-password.html) | `🛡️ Amplified Thinker: Set a new password` |

**Both projects.** Dev and prod each hold their own copy, like every other
dashboard setting. A template edited on one is not on the other, and the failure
is invisible — dev sends the good version while prod sends Supabase's default.

### ⚠️ The subject may not save the first time, and the dashboard will not tell you

Found on production on 2026-08-19, at the cost of three real signups.

**Symptom.** The body was unmistakably ours — right design, right greeting — and
the subject was Supabase's default. The dashboard showed the subject saved.
Reloading showed it saved. Every email sent it as the default anyway.

**⚠️ Note the shape, because it is the opposite of the failure above.** *Both*
default means the template record is not being used at all — that is what
pointed at the HTML comment parse. **Custom body plus default subject means the
subject field alone did not commit.** Same screen, two different faults, and the
combination tells you which.

**What fixed it:** editing the subject by one character, saving, changing it
back, and saving again. So the first save never committed that field.

**The rule, and it applies to every dashboard setting that has no test:**

> **The dashboard is not evidence.** A subject can look saved, survive a reload,
> and not be the one being sent. The only proof is the `Subject:` header of an
> email that actually arrived.

So: save, send one, read the header. **If it comes back default, save again
before investigating anything else** — that is the cheap branch, and skipping it
cost two signups and a diversion into project-switcher and caching theories that
were both wrong.

**The other tabs stay at Supabase's defaults.** Magic Link, Invite, Change Email
Address and Reauthentication are all unused: this site has no magic-link or
invite flow and no UI for changing an account's address. Styling mail that
cannot be sent is work with no reader.

---

## Why there is no separate welcome email

The confirmation email **is** the welcome email. A decision, not a shortcut:

- Supabase's templates only cover mail **Supabase Auth itself sends**. A
  standalone welcome would need its own trigger and its own sender — an Edge
  Function or a webhook, a service to build and keep working, for one message.
- Two emails a second apart, one of which must be acted on, is how the one that
  matters gets missed.
- A welcome-only message that is not required for the account to work starts
  looking like marketing. The sign-up form now promises *"Never a newsletter"*,
  and that promise is easier to keep if no machinery for sending one exists.

---

## `{{ .Data.display_name }}`

⚠️ **The key is `display_name`, not `first_name`.** The sibling Promptly project
uses `first_name`; copying a template across without changing it produces a
greeting that silently falls back to the generic branch forever.

`.Data` is the user's `raw_user_meta_data`. `public/auth.js` writes
`display_name` into it **at `signUp()` time**, which is the only moment that
works — the template is rendered when the mail is triggered, so a name set
afterwards is not in the email that was already sent.

Every use is wrapped in `{{ if .Data.display_name }}`. Accounts created before
2026-08-19 have no name and would otherwise be greeted as *"Welcome, "*.

⚠️ **The `display_name` migration does NOT fix those accounts for email
purposes.** It backfills `profiles.display_name`, which these templates never
read. The statement that fixes `raw_user_meta_data` is a separate data fix —
[../README.md](../README.md), *Backfilling existing accounts*. Applying the
migration and stopping there leaves the emails greeting nobody, with no error
and nothing to notice until one arrives.

---

## Construction, and why none of it is stylistic

| | |
|---|---|
| **Inline-styled tables** | Clients strip `<style>` blocks, ignore most modern CSS, and several ignore background colours on anything but a table cell |
| **System font stack** | The site is Poppins and Inter. Neither can be relied on in mail, and a webfont link is a third-party request from someone's inbox |
| **No images at all** | The logo is an SVG, which most clients will not render — and a remote image is a tracking pixel by another name |
| **The URL repeated as text** | Some clients refuse to render the button; some corporate filters rewrite links in ways that break them. A copy-pasteable URL always works |

Colours are the site's own tokens, written as literals because a stylesheet
cannot travel: `#2D756F` deep-teal, `#1F4D4A` navy, `#2D3330` charcoal,
`#4A5C55` muted, `#EEF2EF` off-white, `#D8E4DD` light-sage.

### What each template says, and why

**Confirm signup is also the welcome** — see above. Beyond the activation
button it carries three things, in this order:

1. What the account is for: your place in every primer and plan is kept, and
   follows you to any device.
2. ⚠️ The honest half — **everything is free to read without an account**. A
   comparison that opens with what is withheld reads as a paywall, which this
   is not.
3. That **until they confirm and sign in they are browsing as a guest and
   nothing is saved**, so it is worth clicking before settling in. The same
   sentence the sign-up panel carries.

**Reset password** leans on reassurance rather than instruction. An unexpected
password-reset email is alarming, and the true answer — *nothing has changed,
and nothing will unless the link is used* — is what settles it, so that line is
prominent rather than buried under steps.

⚠️ **Its `{{ .ConfirmationURL }}` points at Supabase's verify endpoint**, which
validates the token and *then* redirects to the `redirectTo` that
`public/auth.js` passed — `selfUrl()`, the sign-in page. That path must be on
**URL Configuration → Redirect URLs** or Supabase silently substitutes the Site
URL and the visitor lands on the home page with no password form and nothing
explaining why. It does not error. Run `npm run verify:redirects` rather than
trusting the dashboard to look right.

---

## ⚠️ Link expiry is stated in words, and nothing keeps it honest

Three places claim a lifetime, and all three are prose that no test reads:

| Where | Claim |
|---|---|
| `confirm-signup.html` | 24 hours |
| `reset-password.html` | one hour |
| Supabase → Authentication → *Email OTP / link expiry* | the actual value |

**Set the dashboard to match, or change the words.** Confirmation and reset
links genuinely expire on different clocks, so no shared "this link is dead"
copy may ever name a lifetime — it cannot know which kind it is describing.

Both are single-use, and issuing a new one cancels the old.

---

## ⚠️ Three sender settings that these templates cannot protect themselves from

Phase 4 found all three on Brevo, and they are properties of the **sending
provider**, not of the template. Any future provider needs checking again.

- **Open tracking** — an analytics beacon in transactional mail.
- **Click tracking** — the confirmation link stops pointing at Supabase, so a
  **bearer token travels through a third party and into their click logs**, on a
  URL shaped exactly like phishing.
- **`List-Unsubscribe`** — Gmail then renders an Unsubscribe control beside a
  *password reset*. A user can unsubscribe from their own account recovery and
  be suppressed, after which auth mail stops silently.

The full account is in `docs/implementation-sequence.md`, Phase 4.

---

## Where the legal links go, when there are any

Neither template links to a privacy or terms page, because neither exists. When
the privacy page ships (see `BACKLOG.md`), add it to the footer block of both
files — beneath the contact address, matching the muted style already there.

**Do not add the link before the page exists.** A dead link in an activation
email lands at the exact moment someone is deciding whether to trust the site.

---

## Testing

In order — each step depends on the one above, and the last two are the ones
people skip.

⚠️ **Every step below states whether you are signed in, and that is load-bearing
rather than pedantry.** Two defects on 2026-08-19 were reachable only *with* a
live session and passed cleanly without one. A step that leaves the starting
state unsaid tests whichever half the reader happens to imagine.

1. Sign up with a real address you can read. The form should land on **"Account
   created"** with the form replaced, not a message under it.
2. Check where the mail landed — **inbox or spam** — from at least one Gmail and
   one Outlook address. They disagree about new senders more than any other pair.
3. Confirm the greeting uses the first name you typed, and that the whole email
   renders with images blocked (most clients block them by default).
   ⚠️ **And read the `Subject:` header, not the subject line your client shows
   you tidied up.** *Show original* in Gmail. It is Q-encoded when it contains
   an emoji, so `=?UTF-8?Q?=F0=9F=91=8B_Welcome…` is the 👋 subject arriving
   correctly — decode it rather than assuming it is mangled. **A default subject
   here means the field did not save: go back, save it again, and re-send before
   suspecting anything else.**
4. Click the link. It should land on `/sign-in/`, which redirects to the home
   page signed in.
5. Sign out, request a reset, and follow that link. `/sign-in/` should show
   **"Choose a new password"** — *not* the home page with you signed in. That
   was a real defect on 2026-08-19; see `docs/implementation-sequence.md`.
6. Set the new password, then ⚠️ **sign in with the OLD one and be refused.**
   This is the step that proves the reset did something. Reaching the form only
   proves the form was reachable — the 2026-08-19 defect left the old password
   working, and every check that stopped at "it looked right" passed.
7. Follow the *same* reset link a second time, **while still signed in from
   step 6**. It should show **"That link no longer works"** and stay there —
   not send you to the home page. ⚠️ Signed in is the state that matters and
   the state that broke: the usual reason a link is spent is that you just used
   it, so you are nearly always still signed in when you click it again.
   Signed *out*, this passes even when it is broken.
8. Repeat step 7 signed out. Same panel, plus the sign-in form beneath it.
9. Sign up again with an address that has **no** `display_name` — or clear it
   first — and confirm the fallback greeting reads *"Welcome to Amplified
   Thinker"* rather than *"Welcome, "*.

**The one thing this repo can never test:** whether mail from this domain
reaches strangers. Deliverability is a property of DNS records and sender
reputation, not of markup. `npm run verify:email` checks the records; only
sending to accounts you do not own checks the rest.
