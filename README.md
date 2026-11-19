# Packers & Movers CRM: Stage 2 (database + login)

Next.js 14 (App Router) + TypeScript + Tailwind CSS + MongoDB (Mongoose). One project: the API lives in `app/api`.
Mobile-first. Admin + branch managers, branch-separated data, numbering per branch, audit log, files in the database.

## 1. What you need
- **Node.js 20.19 or newer** (22 LTS is best). Older versions fail because Mongoose 9 needs it. Check with `node -v`.
- **MongoDB**: either a local install (https://www.mongodb.com/try/download/community) or a free Atlas cluster (https://www.mongodb.com/atlas)

## 2. Run it
```bash
npm install
cp .env.example .env.local        # then edit it: MONGODB_URI and AUTH_SECRET
npm run dev                       # http://localhost:3000
```
Open the app. The very first visit shows **First-time setup**: create the admin (and the first branch). That page works only once.

Make an `AUTH_SECRET` with:  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

Phone on the same Wi-Fi: `npm run dev -- -H 0.0.0.0` then open `http://<your-pc-ip>:3000`.
Production-style run: `npm run build && npm start`.

### Forgot the admin login, or the login page shows "Wrong login ID or password"?
There is no built-in account. The admin is whatever you typed on the first-time setup page. See which users exist, or set a new password
(works the same on Windows, Mac and Linux):
```bash
npm run list-users
npm run reset-password -- <login id> <new password>      # example: npm run reset-password -- admin MyNewPass123
npm run seed:admin -- <login id> <password>              # creates a new admin if there is none
```

### Optional helpers
- `npm run seed:demo`  : sample branches, managers and documents (admin / Admin@12345, managers pune, mumbai, nashik, bengaluru, delhi / Manager@123). Test databases only.
- `npm run seed:admin -- admin Strong@123` : create the admin from the command line instead of the setup page.
- `BASE_URL=http://localhost:3000 npm run test:api` : 134 API checks (use an EMPTY database; it creates an admin, branches and users).

### If `npm run dev` says a package cannot be found (for example `jose`)
The install did not finish, or an old `node_modules` from the earlier version is still there. Stop the server, then:
```bash
# Mac / Linux                          # Windows (cmd)
rm -rf node_modules .next              rmdir /s /q node_modules .next
npm install
npm ls jose mongoose zod bcryptjs      # each must show a version, no "missing"
```
If one is still missing: `npm install jose bcryptjs mongoose zod dotenv`

## 3. How it works
**Roles**
- *Admin*: all branches. Creates branches and managers, resets passwords, edits settings (company-wide or per branch), opens the audit log, imports the old browser data, downloads a backup, deletes permanently.
- *Branch manager*: sees and edits only their own branch. Creates documents, records payments, deletes to the recycle bin and restores. Cannot open Settings, Users, Branches, Audit or import.
- The server checks the role and branch on **every** request. Hiding a button is never the only protection.

**Login**: login ID + password. Passwords are hashed (bcrypt). A temporary password (new user or admin reset) must be changed at first sign-in. Five wrong passwords lock the account for 15 minutes (admin can unlock). Deactivating a user, changing their branch or resetting their password signs them out immediately.

**Numbering**: assigned by the server when you save, from an atomic counter, never reused (even after delete). Default `CP/PUN/2026-27/0012` style, separate for each branch, restarts each April. Change it in Settings.

**Per-branch settings**: Settings > "Editing settings for" > choose a branch. Anything you fill in (GSTIN, state, bank, address, logo, stamp, signature, terms) applies to that branch's documents; empty fields use the company default. Numbering and PDF defaults are company-wide.

**Files**: logo, stamp and signature are stored in MongoDB (images up to 1 MB) and served only to signed-in users.

**Audit log**: every create, edit (with old and new values), status change, delete, restore, sign-in, failed sign-in, password change/reset, settings change and import. Admin: Audit log page. Everyone: the History section of a document they can see.

**One-time import**: open the old (Stage 1) app's browser, sign in as admin and go to Admin > Import old data. Map each old branch to a real one, import, check, then remove the old data from the browser. Receipts are re-linked to their bills; numbers that already exist are skipped.

**Loading**: the app loads this and last financial year plus every unpaid older bill. Reports can reach further back. Everything refreshes when you return to the tab and every minute.

## 4. Where things live
- `app/api/**`      : the API. `lib/server/**`: database models, auth, documents service (numbering, validation, audit), settings, importer.
- `lib/config.ts`, `calc.ts`, `ledger.ts`, `validateDoc.ts`: document fields and money logic, shared by the browser and the server (the server re-validates everything).
- `lib/store.ts`    : browser-side data layer (calls the API). `middleware.ts`: redirects signed-out visitors to /login.

## 5. Before going live (Stage 3)
HTTPS and a real domain, a strong `AUTH_SECRET` and a MongoDB with authentication and backups, rate limiting at the proxy,
security headers, error logging and uptime monitoring. Offline saving is intentionally not supported any more: every
change goes to the server so that all branches see the same data.
