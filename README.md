# TeamUP

Group project workspace for coordinating tasks, milestones, availability, files, and AI-assisted planning.

**Live shared app:** [https://teamup.landonpack7-teamup.workers.dev](https://teamup.landonpack7-teamup.workers.dev)

---

## For teammates (start here)

You do **not** need Codex or ChatGPT Sites. Use GitHub + a local preview, then the shared live URL after your work is merged.

### What you’ll use

| Purpose | Where |
| --- | --- |
| Code + pull requests | This GitHub repo |
| Local preview while coding | `npm run dev` on your laptop |
| Shared app with real saved data | [Live Cloudflare URL](https://teamup.landonpack7-teamup.workers.dev) |

Local preview uses its **own local database**. Invites, teammates, and lasting project data live on the **Cloudflare** site.

### Requirements

- Node.js **22+**
- Git
- VS Code / Cursor (optional, but handy)

### 1. Clone the repo

```bash
git clone https://github.com/landon-pack/TeamUP.git
cd TeamUP
```

If you already cloned it earlier:

```bash
cd TeamUP
git checkout main
git pull
```

### 2. Install dependencies

```bash
npm ci
```

### 3. Run the app locally

```bash
npm run dev
```

Open the URL it prints (usually **http://localhost:5173/**).

### Local interactive testing

Two localhost modes (neither touches the **live** Cloudflare database):

| Mode | How | What you get |
| --- | --- | --- |
| **Sandbox** (no login) | Open `/workspace` or `/demo` while signed out | Practice project in the browser only; reload resets |
| **Local admin account** | Sign in at `/signin` with `admin` / `teamup`, then open `/workspace` | Real blank account on your machine’s local DB — create projects, tasks, milestones; persists until you reset local data |

Vite hot-reloads as you save files, so you usually don’t need to push to see UI/CSS changes.

On the **live** site, create a real account at **/signup**.

### Editing like HTML / CSS (for teammates new to TypeScript)

You do **not** need to know TypeScript to change copy and look-and-feel.

| What you want to change | Closest to… | Open this |
| --- | --- | --- |
| Page text, headings, buttons, layout structure | **HTML** | `.tsx` files under `app/` (they look like HTML with `className=` instead of `class=`) |
| Colors, spacing, fonts, button look | **CSS** | [`app/globals.css`](app/globals.css) |
| Landing About copy | HTML | [`app/landing/about.tsx`](app/landing/about.tsx) |
| Landing hero / Sign up button | HTML | [`app/landing/hero.tsx`](app/landing/hero.tsx) |
| Sign-in / sign-up page look | HTML + CSS | `app/signin/page.tsx`, `app/signup/page.tsx`, and the `.auth-*` rules in `globals.css` |
| Workspace panels, sidebar, task cards | CSS (+ some HTML in TSX) | `.panel`, `.btn`, `.sidebar-*` in `globals.css`; structure in `app/workspace.tsx` |

Tips:

- Keep `npm run dev` running and refresh/hot-reload in the browser.
- Prefer editing **text inside tags** and **CSS class rules** first; avoid changing `{...}` JavaScript logic until you’re comfortable.
- `className="btn primary"` in a `.tsx` file is the same idea as `class="btn primary"` in HTML — styles live under that name in `globals.css`.

If you see a Vite error about a missing file in `node_modules/.vite`, stop the server (`Ctrl+C`) and run:

```bash
rm -rf node_modules/.vite
npm run dev
```

### 4. Make a branch and work

```bash
git checkout main
git pull
git checkout -b your-name/short-description
```

Edit code, keep `npm run dev` running, and check changes in the browser.

### Landing page — who edits what

| Piece | File(s) |
| --- | --- |
| Page layout / site map notes | `app/landing.tsx` |
| Hero + Sign up / Sign in / Demo buttons | `app/landing/hero.tsx` |
| About Us copy | `app/landing/about.tsx` |
| Image placeholder → real photos | `app/landing/visual.tsx` (+ put files in `public/landing/`) |
| Sign up (working; password + username) | `app/signup/page.tsx` |
| Sign in (works; polish the UI) | `app/signin/page.tsx` |
| Shared auth API helper | `lib/auth-client.ts` |

Routes: `/` landing · `/signup` · `/signin` · `/workspace` app · `/demo` guest mode.

### 5. Commit and open a pull request

```bash
git add .
git commit -m "Describe your change"
git push -u origin HEAD
```

Then open a **Pull Request** into `main` on GitHub.

After the PR is reviewed and **merged to `main`**:

1. GitHub Actions deploys automatically
2. Check the live site: [https://teamup.landonpack7-teamup.workers.dev](https://teamup.landonpack7-teamup.workers.dev)

### 6. Collaborate on a shared project (live site)

1. Open the live URL and sign in
2. Create a project, or accept a teammate’s invite from your notifications
3. Work together on tasks, milestones, files, availability, etc.

Demo mode (no account): open `/demo` on the live site.

### Day-to-day commands

```bash
git pull                 # get latest main
npm ci                   # if package-lock changed
npm run dev              # local preview
git checkout -b my-branch
# ... code ...
git add . && git commit -m "message"
git push -u origin HEAD  # then open a PR
```

---

## Sign-in notes

- Accounts use **username + email + password** (sign in with email or username)
- Use the **same email** teammates invite you with
- Live-site data persists in Cloudflare D1 (refresh won’t wipe it)

## Password reset email (Resend)

Project invites and nudges stay inside TeamUP. Password reset can email a link through [Resend](https://resend.com). Create an API key, verify a sending domain (or use `onboarding@resend.dev` for self-tests), then set:

```text
RESEND_API_KEY=<your key>
EMAIL_FROM=TeamUP <noreply@your-verified-domain>
```

For local development, put these in the ignored `.dev.vars` file. For production:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
```

Project owners invite teammates by name, email, or username from Team or Project settings. The invite appears in that person’s notifications, where they can accept or decline. **Nudge** on the Team page is also an in-app notification.

---

## One-time Cloudflare setup (project owner only)

Teammates can skip this section.

### 1. Create an API token

Cloudflare dashboard → **My Profile** → **API Tokens** → **Create Token**.

Use a token that can edit Workers, D1, and R2 (or the “Edit Cloudflare Workers” template plus D1/R2). Copy your **Account ID** from the dashboard.

### 2. Create resources locally

```bash
npm ci
npx wrangler login
# or: export CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=...

npm run cf:setup
```

This creates the `teamup` D1 database and `teamup-files` R2 bucket, then writes the D1 `database_id` into `wrangler.toml`. **Commit that file.**

### 3. Set Worker secrets

```bash
openssl rand -base64 32 | npx wrangler secret put AUTH_SECRET
printf 'you@school.edu' | npx wrangler secret put SITE_OWNER_EMAIL   # optional
# optional AI:
printf 'your-gemini-key' | npx wrangler secret put GEMINI_API_KEY
openssl rand -base64 32 | npx wrangler secret put AI_CONFIG_ENCRYPTION_KEY
```

`AI_CONFIG_ENCRYPTION_KEY` must be raw base64 that decodes to 16/24/32 bytes (AES-GCM).

### 4. First deploy

```bash
npm run cf:deploy
```

### 5. GitHub Actions secrets

GitHub repo → **Settings** → **Secrets and variables** → **Actions**:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID |
| `CLOUDFLARE_D1_DATABASE_ID` | Same id as in `wrangler.toml` |
| `AUTH_SECRET` | Same secret used above |
| `SITE_OWNER_EMAIL` | Optional |
| `GEMINI_API_KEY` | Optional |
| `AI_CONFIG_ENCRYPTION_KEY` | Optional |

After that, every push to `main` deploys.

---

## Useful scripts

- `npm run dev` — local development server
- `npm run build` — production build into `dist/`
- `npm run cf:migrate` — apply Drizzle SQL to remote D1
- `npm run cf:deploy` — build + migrate + deploy
- `npm run test:database` — relational store smoke test

Environment template: `.env.example` (copy to `.env.local` for local secrets; never commit real values).

---

## Tech stack

- Frontend: React / TypeScript (Vinext + Vite)
- Backend: Cloudflare Workers API routes
- Database: Cloudflare D1 (SQLite) + Drizzle migrations in `drizzle/`
- Files: Cloudflare R2

---

## App summary

TeamUP helps busy groups manage deadlines, task ownership, availability, and reminders with optional AI help. Projects stay private to their members.

### Quick verification

1. Sign in with name + email on the live site
2. Create a project and add a task with a due date
3. Reload — the task should still be there
4. From Team, search a teammate by name, email, or username and send an invite. Accept it from the other account’s notifications.
