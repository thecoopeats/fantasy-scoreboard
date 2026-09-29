# 🏈 Fantasy Scoreboard

All your fantasy football matchups (Sleeper, ESPN, and soon Yahoo) on one page, for you and your friends.
Each person signs in with an email link and connects their own leagues.

**Stack:** Next.js (hosted on Vercel) + Supabase (login and database). Both are free at this scale.

---

## 1. Create the Supabase project (login + database)

1. Sign up at https://supabase.com and create a **New project**. Pick any name and region, and save the database password somewhere.
2. **Create the tables:** go to **SQL Editor → New query**, paste everything from `supabase/schema.sql`, then click **Run**.
3. **Get your keys:** go to **Project Settings → API** (or **API Keys**) and copy:
   - the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - the **anon** / **publishable** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Update the email templates:** go to **Authentication → Emails → Templates**. In *both* **Magic Link** and **Confirm signup**, replace the body with:

   ```html
   <h2>Sign in to Fantasy Scoreboard</h2>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Click here to sign in</a></p>
   <p>Or enter this code: <b>{{ .Token }}</b></p>
   ```

   This lets the link work even when it's opened in a different browser than the one that requested it (for example, a phone's mail app). The code works as a backup.
5. **Set the site URL:** go to **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:3000` for now. Change it to your Vercel URL after you deploy (step 4).
   - **Redirect URLs:** add `http://localhost:3000/**`, and later `https://your-app.vercel.app/**`.

## 2. Set up email sending (needed before friends can sign in)

Supabase's built-in email only sends to members of your Supabase team, and only a few emails per hour. For friends, connect your own SMTP server under **Authentication → Emails → SMTP Settings**.

**Easiest option, a Gmail account:**
1. Turn on 2-Step Verification for the Google account.
2. Create an **App password** at https://myaccount.google.com/apppasswords.
3. In Supabase SMTP settings, enter:
   - Host `smtp.gmail.com`, port `465`
   - Username: your Gmail address
   - Password: the app password
   - Sender email: your Gmail address. Sender name: `Fantasy Scoreboard`.

(If you own a domain, [Resend](https://resend.com) is a nicer option and has a free tier.)

## 3. Run it on your computer

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
cp .env.example .env.local        # then fill in the values
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # paste the output as ENCRYPTION_KEY
npm run dev
```

Open http://localhost:3000.

- `ALLOWED_EMAILS` is your invite list. Only those addresses can sign in. Leave it empty to allow anyone.
- **Never change `ENCRYPTION_KEY`** once people have connected private ESPN leagues. Their saved cookies would become unreadable, and they'd have to re-add those leagues.

## 3b. Set up Yahoo (one time, by the site owner)

1. Run `supabase/add-yahoo.sql` in the Supabase SQL Editor. (Skip this if you ran the full `schema.sql` after Yahoo was added.)
2. Go to https://developer.yahoo.com/apps/create/ and sign in with any Yahoo account:
   - **Application Name:** Fantasy Scoreboard
   - **Redirect URI(s):** `https://localhost:3000/auth/yahoo/callback` for local testing. Change it to `https://your-app.vercel.app/auth/yahoo/callback` after you deploy.
   - **OAuth Client Type:** Confidential Client
   - **API Permissions:** check **Fantasy Sports → Read**
3. Click **Create App**. Copy the **Client ID** and **Client Secret** into `.env.local` as `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET`.

**Local testing:** after you approve access on Yahoo, it sends you to `https://localhost:3000/...`, which won't load because the local app runs on plain `http`. That's expected. Copy the whole address from the address bar, open **My leagues → Yahoo → "Yahoo sent you to a page that won't load?"**, paste the address, and click **Finish connecting**.

**Online (Vercel):** leave `YAHOO_REDIRECT_URI` empty and update the Redirect URI in the Yahoo app to your Vercel URL. **Connect Yahoo** then works in one click.

## 4. Put it online (Vercel)

1. Push this folder to a new **private** GitHub repository.
2. At https://vercel.com, click **Add New → Project** and import the repository.
3. Under **Environment Variables**, add the same four values as in `.env.local`, then click **Deploy**.
4. Back in Supabase **URL Configuration**, set the **Site URL** to your Vercel URL and add it to **Redirect URLs**.
5. Send your friends the link, and add their emails to `ALLOWED_EMAILS` in Vercel. Vercel needs a redeploy after you change environment variables.

---

## How each platform works

| Platform | What the user provides | Notes |
|---|---|---|
| Sleeper | Their username | Official public API. Picks up every league they're in this season automatically. |
| ESPN (public league) | League ID or league URL | They pick their team from a dropdown. |
| ESPN (private league) | League ID + `espn_s2` and `SWID` cookies | Cookies are encrypted with AES-256-GCM before they're saved. The team is detected automatically. The cookies expire eventually and must be re-added when they do. |
| Yahoo | Clicks **Connect Yahoo** and approves | Official API through Yahoo's login flow (OAuth). Tokens are encrypted before they're saved and refresh automatically every hour. Includes every Yahoo league they're in this season. |

Scores refresh every 60 seconds while the page is open.

## Project layout

```
app/
  page.tsx, Dashboard.tsx   scoreboard (client-side refresh)
  settings/                 "My leagues": connect/remove accounts
  login/                    magic-link + code sign-in
  auth/confirm, signout     auth callbacks
  api/matchups/             gathers every matchup for the signed-in user
lib/
  providers/sleeper.ts      Sleeper API
  providers/espn.ts         ESPN API
  crypto.ts                 encryption for stored secrets
  auth.ts                   session + invite list
supabase/schema.sql         tables + row-level security
```
