# Cloud Packers CRM: Stage 2 (database + login)

## What changed in 0.7.0
- **Quotation and Bill have new boxes**, the same as the format your staff already use:
  - Quotation: Quotation details, Move from, Move to (country, state, city, pincode, address, floor, lift), Payment details,
    Insurance details, Vehicle insurance details, Other details, Items list.
  - Bill: Bill details (LR no., delivery date, type of shipment, moving path, P.O.), Billing details, Consignor / move from
    ("same as billing" tick box), Consignee / move to, Payment details (with reverse charge, GST paid by), Package details,
    Insurance, Vehicle insurance, Other details (payment due date), Items list.
- **New way of working out the total** (`freightCalc` in `lib/calc.ts`): freight + packing / unpacking / loading /
  unloading / packing material (each "Included in Freight", "Extra charge" or "Not Applicable") + storage, car transport,
  miscellaneous, other, S.T., green tax = sub total; minus discount; plus surcharge (% of freight); plus GST (unless
  "GST Charge Hide"; not added when reverse charge = Yes); plus insurance / vehicle insurance when "Included"
  ("Optional" is shown but not added). Insurance uses the declared value, or the Items list total value when empty.
  Quotation option "Total amount in PDF: Hide" leaves the totals off the PDF.
- Older quotations and bills (made with the priced "Services & charges" list) keep their old total. When one is opened
  for editing, its old sub total moves into Freight and the old lines are kept in the remark, with a notice to check.
  Proforma Invoice still uses the priced list; one made from a new quotation gets a single line with its amount.
- **Items list** now has Item, Qty, Value (₹) and Remarks.
- **Item search**: typing in an item box shows matching items from about 120 household items with other names and Hindi
  ("fri" → Fridge, "पलंग" → beds, "alm" → Almirah). Arrow keys + Enter, or tap. The list is in `lib/catalog.ts`.

## What changed in 0.6.0
- **Nothing is mandatory.** Every form saves with whatever is filled in. The branch is picked for you and the date
  defaults to today. Only typed values are checked (a mobile number must be 10 digits, an amount cannot be negative…).
  The one exception is the customer survey link form, where the customer must give a name and mobile number.
- **Forms open section by section**: "Main details" (number, date, branch, status, customer) is open; every other
  section is closed until tapped, with a "filled" count. A section with a problem opens itself and shows a red mark.
  Same on phone and desktop.
- **Items list on Quotation and Bill** (bed, LED TV, fridge… with quantity and remarks), before "Services & charges".
  It is printed on the PDF and shown on the document page, without prices. Making a quotation or bill from a Survey or
  Packing List copies its items here; making a bill from a quotation copies the list too.
  Stored in the document data as `goods` (cleaned and limited by the server), so no database change is needed.

## What changed in 0.5.0
- The phone's bottom menu (Home, Documents, +, Payments, Settings) is on every page, including new/edit forms and
  document pages. Save / Cancel are at the end of the form; Download PDF / WhatsApp / Edit are at the top of a document.
- Survey List in the side menu has 3 options: Add New, Go To List, **Share survey link** (on the phone: New, List, Link).
- Dashboard: a new picture (city, road and a Cloud Packers truck, drawn in SVG in `components/HeroArt.tsx`) and the
  greeting "Hello, <branch name>!" (admin on All branches sees "Hello, All branches!").
- Responsive fixes found by testing every page at 320, 375 and 1366 px wide: list headers on phones, labels that line
  up side by side, text boxes that grow with their text (terms no longer cut off), no wrapping document numbers,
  payment totals on phones, status box on document pages, the scroll counter no longer covers rows.
- Security headers: nosniff and no framing by other sites.

## What changed in 0.4.0
- **Menu dropdowns**: each document in the side menu opens to **Add New** and **Go To List**. On the phone, the
  Documents button shows **New** and **List** for each one.
- **Lists load 10 at a time** and add 10 more as you scroll near the end. A small counter on the right shows how many
  are loaded and how many are left. This is on every list: documents, customers, payments, receipts, reports,
  recycle bin and the audit log.
- **One document per line**: lists are tables (number and date, customer and phone, from/to city, amount, status,
  PDF button and a ⋯ menu with View, Edit and "Make quotation / bill / …" from this document).
- **More colour and Hindi**: every menu item, page title, form section, field, button and status also shows Hindi.
  PDFs stay in English (the PDF fonts cannot print Hindi). Change the Hindi words in `lib/hi.ts`.
- **Survey link for customers**: Survey List > **Share survey link**. The customer opens the link on their phone,
  fills their details and items, and presses Send. The survey appears in your Survey List with the status
  **From customer**. From the ⋯ menu make a Quotation, Bill or Packing List from it.
  Security: each link is random, works **once**, expires after **7 days**, can be cancelled, is stored only as a
  hash, and is limited per address. The customer can fill only the customer, move and item fields.
- **New item entry**: type the item in the boxes, press **Add item** (or Enter): it goes into the list below and the
  boxes empty for the next one. Use the pencil to change an item, the bin to remove it. An item left in the boxes
  is added automatically when you save.
- Survey List now also has From city, To city, Moving date and Service type (so they carry over to a quotation).

## What changed in 0.3.0
- **Documents**: only Quotation, Survey List, Packing List, LR/Bilty, Vehicle Condition, Proforma Invoice, Bill/Invoice,
  Money Receipt and FOV-SCF Form. Payment Voucher, TWS, NOC, Loading Slip and Letterhead are removed from the app.
  Old documents of those types are NOT deleted from the database; they are just hidden.
- **Faster loading**: after the first load the app asks the server only for documents that changed (new, edited, deleted)
  instead of downloading everything every minute. A full reload still happens every 15 minutes as a safety net.
  Lists show 30 at a time with a "Show more" button.
- **Filters** on every document list (Quotation, Bills, …): date (today, last 7 days, this/last month, last 3 months,
  this/last financial year, custom range), document date or moving date, city, amount min/max, sort order, status and search.
  Picking a date older than what is loaded fetches the older documents. Filters stay while you open a document and come back.
- **Cloud Packers logo** in the menu, the phone header, the sign-in page, the app icon and on PDFs
  (a logo uploaded in Settings still takes priority on PDFs).
- **"Are you sure?" popup** before approving/rejecting a quotation on the dashboard, changing a status, cancelling a bill
  or moving a document to the recycle bin.
- **Darker outlines** on all input boxes.
- New index on documents (`updatedAt`); MongoDB builds it automatically on the next start.


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

**Loading**: the app loads this and last financial year plus every unpaid older bill. Reports and list filters can reach further back (older documents are fetched only when asked for). After that it downloads only what changed, when you return to the tab and every minute.

## 4. Where things live
- `app/api/**`      : the API. `lib/server/**`: database models, auth, documents service (numbering, validation, audit), settings, importer.
- `lib/config.ts`, `calc.ts`, `ledger.ts`, `validateDoc.ts`: document fields and money logic, shared by the browser and the server (the server re-validates everything).
- `lib/store.ts`    : browser-side data layer (calls the API). `middleware.ts`: redirects signed-out visitors to /login.

## 5. Before going live (Stage 3)
HTTPS and a real domain, a strong `AUTH_SECRET` and a MongoDB with authentication and backups, rate limiting at the proxy,
security headers, error logging and uptime monitoring. Offline saving is intentionally not supported any more: every
change goes to the server so that all branches see the same data.
