# Cloud Packers CRM: Stage 2 (database + login)

## What changed in 0.17.2 — Android app

- Added `public/.well-known/assetlinks.json` for the Android app built with PWABuilder (package `app.vercel.packers_crm_x4bn.twa`). It lets the app open full screen without the browser bar. The file opens without login.
- If the web address changes later (for example to `crm.cloudpackers.com`), build a new APK in PWABuilder **with the same signing key** and replace this file with the new one.
- Keep the signing key file and its passwords safe and private. Never put them in this project.

## What changed in 0.17.1

- Complaints filter (admin): the City list and the dates are on one screen. City is a dropdown with all 17 branch cities; the dates keep *Custom* with start and end date.

## What changed in 0.17.0

- **Complaints → City filter (admin only).** The *More* button on the Complaints page now has two tabs: **Date** and **City**. Pick a city from your branches. The admin no longer has to switch branch to see one city's complaints. A *City: …* chip shows the active filter; × removes it. Unassigned complaints count for a city when their location is in that city (PCMC → Pune).
- **PDF header:** the truck picture is replaced by an **ISO 9001:2015 Certified** seal, a **24x7 Support** badge and a **33 Branches – All over India** badge. Change these texts in `lib/brand.ts` → `PDF_BADGES`.
- **PDF total:** the Total bar has an orange accent, like the sample.
- **PDF footer:** customer and authorised signatures sit at the bottom of the last page with small icons and a houses illustration between them; the page number band has lines on both sides.

## What changed in 0.16.4 — date filter

- Fixed: the **More** button on the dashboard, Customers and Complaints did nothing (its list was hidden inside the button group).
- **More** now opens a *Date range* dialog like Google Search Console: Today, Last 7 / 28 days, Last 3 / 6 / 12 / 16 months, This / Last financial year, All time, Custom (start and end date). Each choice shows its dates. Cancel / Apply; Esc or a click outside closes it. On phones it opens from the bottom.

## What changed in 0.16.3

- `website/crm-complaint-hook.php` now writes one line per complaint to `crm-complaint-log.php` (same folder): time, HTTP code, CRM reply, connection error. No customer details. It cannot be opened from a browser; read it in Hostinger File Manager.

## What changed in 0.16.2 — website complaints fix

- The CRM now understands the cloudpackers.com complaint form's own field names (`Mobile_Number`, `email_address`, `consi_num`, `Moving_from`, …), so the mobile, email and consignment number are used to find the branch.
- A complaint with the optional message box left empty is no longer refused.
- `website/crm-complaint-hook.php` waits up to 15 s (was 5 s) because the first request after a quiet period can take a few seconds while the CRM wakes up. Copy line 17 (your key) from your current hook file into the new one before uploading it.

## What changed in 0.16.1 — client logos on quotations

- Every **quotation PDF** now has an **"Our valued clients"** box (just before Terms & Conditions) with the logos of Asian Paints, Castrol, InfoVision, SBI, TPNODL, FSNL, Blue Star, JSW Steel, L'Oreal India and Netlabs. Bills and other documents are unchanged.
- The logos are small files in `public/clients/` (about 75 KB together), so the PDF stays small.
- To add or remove a client: put a small JPG in `public/clients/` and add or delete its line in `lib/brand.ts` → `CLIENT_LOGOS`.

## What changed in 0.16.0 — website complaints

- **Complaints section** (menu → *Complaints*, plus a card on the dashboard next to *Quotations waiting for approval*). Only the **admin** and **TSMs** see it; the team does not.
- **Automatic routing.** Every complaint from the cloudpackers.com form is matched against the CRM: first the invoice / consignment / LR number, then mobile number and email, then (only if nothing else was given) the name. If all matches point to one branch, it goes straight to that branch's TSM (status *Forwarded*). If nothing matches, or matches point to different branches, it stays with the admin (status *New*).
- **Admin forwarding.** The admin opens the complaint, checks the place with *Open in Maps*, and forwards it. The branch is pre-selected from the location (e.g. PCMC / Wakad → Pune, Thane → Mumbai, Gurgaon → Delhi) but the admin decides.
- **Statuses:** New, Forwarded, In progress, Called - no answer, Resolved, Closed. Every change or note is kept in the history.
- **48-hour reminder:** an open complaint with no action for 48 hours shows a red badge, and the dashboard shows a popup once a day until someone acts. Any status change or note restarts the 48 hours.

### Connecting the website form (one time)

1. In Vercel → Project → Settings → Environment Variables add `COMPLAINT_KEY` = a long random text (at least 24 characters, e.g. from `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`). Redeploy.
2. Open `website/crm-complaint-hook.php`, paste the **same** key into `CRM_COMPLAINT_KEY`, and upload the file next to the PHP file that the complaint form posts to (its `action`).
3. In that PHP file, **after** the email is sent, add these two lines. Nothing else is changed or removed (your mail ID / password stay as they are):

```php
require_once __DIR__ . '/crm-complaint-hook.php';
send_complaint_to_crm($_POST);
```

If the CRM is down, the website still sends the email as before; the hook waits at most 5 seconds and only writes to the PHP error log.

## What changed in 0.15.0 — extra security

- **Two-step login for the admin** (Account → *Security · two-step login*): after the password, a 6-digit code from a free authenticator app (Google / Microsoft Authenticator). Standard TOTP, no extra package; the secret is stored encrypted with `AUTH_SECRET`; a code cannot be used twice; 8 one-time **backup codes** for a lost phone; wrong codes count towards the 15-minute lock. Lost phone *and* backup codes: `npm run reset-password -- <login id> <new password>` also turns two-step login off.
- **New-device alert**: when an admin account signs in on a phone/computer it never used before, the admin dashboard shows "New sign-in … Was this you?" with **Yes** / **No, sign it out** (signs that device out at once). Optional Telegram and/or email message too: set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`, and/or `BREVO_API_KEY` + `ALERT_EMAIL` + `ALERT_FROM_EMAIL` in Vercel (see `.env.example`).
- **Password again for sensitive actions** (valid 10 minutes on that device): creating an account, setting a password, switching an account off or changing its role/branch, deleting a branch, *Set up the 17 branches*, downloading the backup, and changing two-step login.
- Editing only a user's **name** no longer signs them out (it happened because the form also sent the unchanged role and branch).

## What changed in 0.14.0 — login made simple

- **Setup page once, for ever**: the first visit shows the setup page; the admin types name, login ID and password (used from then on). Setup also adds the **17 Cloud Packers branches** with their contact details and the company email. After that nobody ever sees setup again (a database lock stops a second setup even if two people press at the same time).
- **The admin makes every account**: Users → Add user: name, login ID, role, branch, **password typed twice** (show/hide, no auto-capitals, no spaces at the ends). After saving, the exact login ID and password are shown to copy and send.
- **Nobody else changes passwords**: no "choose a new password" page at first sign-in any more, no change-password for branch owners or Team; their account menu says "To change your password, contact the admin". The admin changes anyone's password with **Change password** (typed twice); all their devices are signed out.
- Team accounts: the admin **and** the branch owner (My team) can create their branch's one Team account, edit it, set its password (typed twice), switch it off and sign out its devices — as before.
- **Start clean**: `npm run wipe-all` (see below) deletes all old data so the site starts again at the setup page. `seed:admin` and `seed:demo` were removed.

## What changed in 0.13.1

- **The 17 Cloud Packers branches**: Branches → *Set up the 17 branches* shows a preview and, on *Apply*, adds or updates Agartala, Ahmedabad, Balasore, Bangalore, Bhadrak, Bhubaneswar, Chennai, Delhi, Durgapur, Hyderabad, Indore, Kochi, Kolkata, Mumbai, Pune, Ranchi and Visakhapatnam with the address and phone(s) from cloudpackers.com (list in `lib/branchPresets.ts`). Existing branches keep their name and code (document numbers unchanged). Branches not in the list are deleted when empty, otherwise switched off with their data kept. The company email info@cloudpackers.com is saved if none is set.
- Branches have an optional **second phone**; both numbers print on the PDF.

## What changed in 0.13.0

- **Logged-in devices** (like Instagram's login activity): every sign-in is recorded as a device (phone model / system, browser, IP, city from Vercel, signed-in time, last active). Branches shows, under each branch, the branch owner's and Team account's devices with **Sign out** per device and **Sign out all**; admin accounts are at the top. A branch owner sees their branch's devices in My team. Resetting a password, changing a role/branch or switching a user off signs out all their devices. Only a hash of each device id is stored.
  - **After this update everyone must sign in once again** (old sign-ins had no device record).
- **Admin and Team accounts**: Users has filters (All / Admin / Branch owners / Team accounts) and a list of branches without a Team account, each with a one-tap "create".
- **Customer first**: a new quotation or bill can only be made for a customer saved in Customers. The form opens with "First add the customer": search your customers or *Add new customer* (after saving you come straight back with the details filled). Converting from a survey / quotation and Duplicate link the customer with the same mobile automatically. The server refuses a quotation / bill without a saved customer of that branch.
  - The Team account can now see, add and edit its branch's customers (no delete, no export).
  - The "From documents" customer list is removed; Customers shows only saved customers / leads.
- **Smaller PDFs**: logo, stamp and signature are resized to the size they print at (logo as JPEG), and the PDF is compressed — normally well under 1 MB.

## What changed in 0.12.0

- **Hindi removed** from the whole app (labels, statuses, menus, dialogs). Hindi item names still work when typing in the item search.
- **Cancel with a reason, in two steps** (like delete): choosing *Cancelled* in any status dropdown, in the edit form, or "Cancel bill" asks 1) why, 2) "Are you sure?". The reason, who and when are shown on the document page and saved in the audit log; the server refuses to cancel without a reason. Choosing another status later clears it.
- **Preview** button on every document page: shows the PDF inside the app (Android phones open it in a new tab, since Android browsers cannot show a PDF inside a page).
- **Survey link form** redesigned: brand header with branch and phone, steps, numbered cards, larger tap targets and a Send button that stays at the bottom on phones.
- **Survey customers go to Customers**: when a customer sends the survey form, they are added to *Leads & customers* of that branch (source "Survey link"). If the same mobile number is already a lead, the survey is added to it and only its empty boxes are filled.
- **Phones**: the Documents sheet no longer squeezes buttons (they move to their own row when needed); text is slightly smaller on phones (14px base); text boxes stay 16px on iPhone so Safari does not zoom in.

## What changed in 0.11.1

- The "Head Office" branch made by first-run setup in older versions is cleaned up automatically the next time the admin opens the app: deleted if it is empty, otherwise hidden (deactivated) with its documents kept. If an active user still belongs to it, it is left alone. Each step is in the audit log.
- The branch dropdown's first option is now **Admin (all branches)** instead of "All branches".

## What changed in 0.11.0

- **New PDF design** for every document (quotation, bill, LR, survey, packing list, vehicle condition, proforma, receipt, FOV, letters): letterhead with logo, tagline and a truck illustration, a contact strip, a rounded title badge, sections in tabbed boxes, blue tax table, amount in words, totals with a dark "Total" bar, terms box, signature area and a wave footer with page numbers.
- **Branch contact on PDFs**: mobile and address come from the branch (Branches → edit), email from Settings (same for all branches). While these are empty, SAMPLE details are printed (+91 98765 43210, info@cloudpackers.com, "Office No. 12, Main Road, <city>"); change them in the app, or the defaults in `lib/brand.ts`.
- **Share with customer** (⋯ menu and the document page): WhatsApp and Email buttons. They open a short message addressed only to the mobile / email saved on that document, with a link to the PDF. Buttons stay disabled until the number / email is filled in.
  - The PDF link (`/p/...`) is signed with `AUTH_SECRET` (HMAC-SHA256), opens only that one document read-only, expires after 90 days, stops working if the document is deleted, is rate-limited and not indexed. Every link made is in the audit log. Changing `AUTH_SECRET` cancels all links.
- Quotation form: **Customer name** now comes first (before company name and GST), and "Party name / Party mobile" are renamed "Customer name / Customer mobile".
- Responsive: checked every page at 320, 375, 768, 1024 and 1440 px wide; on very narrow phones (< 380 px) form boxes now take the full width.

## What changed in 0.10.0

**Three kinds of users**
- *Admin*: everything, all branches.
- *Branch owner (TSM)*: their own branch only. Creates and manages that branch's Team account (name, password, deactivate, unlock) from **My team**. Sees everything the team saves.
- *Team (executives)*: one shared login per branch, usable on many phones at the same time. Can make, edit and change the status of Quotation, Survey list, Packing list, LR / Bilty and Vehicle condition in its own branch only. It cannot delete, and cannot open bills, receipts, payments, reports, customers, the recycle bin, users or settings. These rules are checked on the server for every request (pages, lists, sync, PDFs, audit history), not only hidden in the menu.
- Only one Team account per branch (the server refuses a second). Its password is set by the branch owner or admin and is not forced to change; resetting it signs out every phone.
- Every sign-in (and failed sign-in) is in the Audit log with the role, branch, browser/phone and network. The Audit log can be filtered by *Who* (Admin / Branch owner / Team) and *Area* (sign-ins, documents, customers…).

**Customers / leads**
- Customers page has two tabs: *Leads & customers* (added by hand) and *From documents* (built from saved documents, as before).
- Add customer: name, mobile, email, date, from, to, lead source, lead type (Hot/Warm/Cold), shifting type, item type, status, shifting date, follow-up date, addresses, remarks. Statuses: Lead generated, Contacted, Follow-up, Quotation sent, Converted, Not responded, Lost.
- Filters: date range, branch (admin), status chips with counts, source, lead type, shifting type, item type, search, sort. Export to Excel (with a *Monthly summary* sheet) or CSV.
- Monthly leads vs converted, per branch for the admin.
- ⋯ on a customer: Create quotation / survey / bill (details are filled in), Edit, WhatsApp, Delete. Making a quotation moves the lead to *Quotation sent*, a bill to *Converted* (never backwards).
- Every new document form has **Fill from a saved customer**: type a name or mobile and pick a lead or a past customer; only empty boxes are filled. Adding a customer first is never required.
- Excel/CSV exports neutralise cells that start with = + - @ so a typed name can never run as a formula.

**Head office removed**: first-run setup no longer creates a "Head Office" branch. Add your branches in Branches. An existing unused "Head Office" can be deleted in Branches (or deactivated if it already has documents).

## What changed in 0.9.0
- **Six GST choices** on Quotation and Bill (`gstChoice` in `lib/calc.ts`):
  GST Charge Show In Quotation/Bill (added, CGST+SGST or IGST shown) · GST % Show & GST Charge Hide (added, only the
  rate shown, no GST table on the PDF) · Without GST (none) · GST Exempted (none, "GST exempted" printed) · GST Extra
  (not in the total, shown below it) · GST Included in Subtotal (amounts already contain GST; taxable value and GST are
  worked out from them and always add up exactly). Old "GST Charge Hide" = Without GST.
- **Statuses** start at **Pending**, then **In process**, then the finishing ones (quotation: Approved, Booked,
  Rejected, Cancelled; survey: Link sent, Filled by customer, Completed, Cancelled; packing: Packed, Delivered…).
  Bill (Unpaid / Partial / Paid / Cancelled) and Money Receipt still follow the money.
- **Survey links**: making a link adds the survey to the Survey List at once as **Link sent**; when the customer sends
  the form, that same survey is filled in and becomes **Filled by customer**; cancelling the link marks it Cancelled.
- **Smaller text and less empty space**: base size 15px (14.5px on computers), tighter page, cards, hero and sidebar.
  Text boxes stay 16px on phones so iPhones do not zoom in.
- Checked: 55 calculation tests (all GST choices, discount, surcharge, insurance, round off, IGST, reverse charge,
  bill advance + payments, payment QR amount, old-style quotations, survey → quotation → bill copying, numbering, +91),
  every page at 320 / 375 / 1366 px wide with no sideways overflow and no script errors.

## What changed in 0.8.0
- **Delete from the list** (⋯ menu) and from the document page, in two steps: write a reason, then "Are you sure?".
  The reason, who deleted it and when are shown in the Recycle bin (new fields `deleteReason`, `deletedByName`;
  the server refuses a delete without a reason).
- **Status dropdown in every list and on the document page** (not on the create form). A confirmation popup comes first.
  Bills: "Paid" / "Partial" opens Record payment (a money receipt is saved, so totals stay right), "Cancelled" cancels,
  a cancelled bill can be made active again; "Unpaid" explains that the receipts must be deleted first.
  Rows are coloured: green = done / paid / approved, red = unpaid / rejected / cancelled, blue = in progress.
- **Dashboard date filter** like Search Console: Today, 7 days, 28 days, 3 months, More (12 months, this / last
  financial year, all time, custom dates). It drives the five numbers and the chart, for every branch and the admin.
  Older documents are fetched only when a longer period is picked. The choice is remembered on the device.
- **Chart**: three bars per day / week / month: Quotation (red), Bill (blue), Paid (green), with totals above.
- **Upcoming packing** next to the chart: the next 30 days from the packing date (or moving date) on quotations
  (not rejected), packing lists and surveys; the same customer on the same day shows once.
- **+91** shown in front of every mobile box and printed as "+91 98765 43210" on the PDF, document page and lists
  (numbers are still saved as 10 digits; pasting "+91…" works).
- **Payment QR**: "Scan to pay" card on bills (and the PDF) for exactly the balance due after discount, advance and
  payments received. Needs the company UPI ID in Settings › Bank details. The UPI ID is checked, the name and note are
  cleaned, and nothing is shown when nothing is due or the bill is cancelled. Quotations have no payment QR.
- **Daily numbering**: new default `{PREFIX}/{BR}/{DATE}/{NN}` → QTN/DEL/23-11-26/01 (the running number restarts
  every day, per branch and document type, using the document date). Settings saved with the old default switch
  automatically; a custom format you typed is kept. Existing documents keep their numbers.

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
Mobile-first. Admin, branch owners (TSM) and one shared Team account per branch, branch-separated data, numbering per branch, audit log, files in the database.

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
```

### Optional helpers
- `npm run wipe-all` : shows what is in the database; `npm run wipe-all -- <database name>` DELETES EVERYTHING (users, branches, documents, customers, settings, audit log) so the site starts again from the setup page.

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
- *Branch owner (TSM)*: sees and edits only their own branch. Creates documents, records payments, deletes to the recycle bin and restores, manages leads and the branch Team account. Cannot open Settings, Branches, Audit or import.
- *Team (executives)*: shared branch login for Quotation, Survey, Packing list, LR / Bilty and Vehicle condition only; no delete.
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
