# RE/MAX Kenya Secret Santa 🎁

A mobile-friendly Secret Santa web app for RE/MAX Kenya and RE/MAX Professionals. Built for **GitHub → Netlify**. No database account is required: participant records and draw results are saved in **Netlify Blobs** for your Netlify site.

## Features
- Nickname, gender option, and private **4-digit PIN** registration.
- Public nickname list and participant count (no PINs or gender details shown).
- Organiser password protects the draw, schedule, and reset.
- Securely shuffled, circular match allocation: nobody can receive themselves; everyone gives to exactly one person.
- Optional registration closing date and matching reveal date, displayed in **East Africa Time (Nairobi)**.
- Participants enter their nickname + PIN to reveal only **their own** match after unlocking.
- Gift guidelines: minimum KES 1,500, no cash gifts.

## Deploy to GitHub and Netlify

1. Create a new **private GitHub repository**, e.g. `remax-kenya-secret-santa`.
2. Upload the **contents of this folder** at the repository root: `public/`, `netlify/`, `netlify.toml`, and `package.json`. (Do not upload a ZIP as a single file.)
3. Visit https://app.netlify.com → **Add new project** → **Import an existing project** → GitHub → select your repository.
4. Netlify reads the supplied `netlify.toml`. If asked, use **Publish directory: `public`** and **Functions directory: `netlify/functions`**. Dependency installation uses `package.json`.
5. In **Project configuration → Environment variables**, add:
   - **Key:** `ADMIN_KEY`
   - **Value:** a strong, unique organiser password **at least 12 characters** long. Never put this in GitHub or in source files.
   - Use the environment variable for **Functions** (or all scopes), then **redeploy** the site if you added it after deploy.
6. Open your live Netlify URL and test registration. Scroll to **Organiser access** to sign in with that password.
7. Set the closing and unlocking dates. After registration, select **Draw names & close registration**. Matches appear to participants at the unlock date (or immediately if left blank).
8. Share the Netlify site URL with staff and agents. You can set a custom site name such as `remax-kenya-secret-santa.netlify.app` if available.

**Important:** Netlify does **not automatically shut down** the website on December 20. If your event is only meant to run until **20 December 2026**, set your registration close time accordingly. On or after December 20, manually disable the site in Netlify or remove the deployment when you no longer need it. Don't delete the site before participants have viewed their matches.

## Practical privacy and operational notes
- Participants should use **nicknames only**, not phone numbers or other personal identifiers.
- The PIN is stored as a salted `scrypt` hash (not in plain text). A four-digit PIN has low entropy; this app has basic failed-attempt lockouts, but it is meant for a low-stakes office gift exchange, not sensitive information.
- Nobody can retrieve a lost PIN through the interface. Before the draw, the organiser can reset the entire event, but a reset permanently erases registrations and matches.
- Each record and the draw are held in Netlify Blobs. **This is designed for a small office event**, not high-concurrency signups or high-assurance secrecy. Rare concurrent signups or admin actions may require manual attention. Avoid multiple people conducting the draw at the same time.
- Netlify Blob data belongs to the **Netlify site** and may not transfer automatically if deployed to a different site. Keep using the same Netlify project.
- This app does not send emails, texts, or WhatsApp notifications. Participants return to the same URL to view matches.
- All registered nicknames are visible to other participants. Gender is only shown to the matching giver, unless the registrant chose 'Prefer not to say'.

## Local checks
Run `npm install` and `npm run check` to syntax-check the function. For end-to-end local development, use `npx netlify dev` with Netlify CLI configured and a local `ADMIN_KEY` environment variable.
