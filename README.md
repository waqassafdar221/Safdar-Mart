# Safdar & Sons Pharmacy + Mart — In-Store Signage Board

A single-page offer board for the shop TV, built to match `reference.png`. Plain
HTML/CSS/JS — no build step, no framework, no server code. Drop the folder on any
static host, open the URL on the Android TV browser, and it runs forever on its own.

**Layout, top to bottom:** a full-width banner slider that crossfades between your
promo artwork · TODAY'S DEALS bar · **one row of 6 product cards** that crossfades to
the next 6 every few seconds · category strip that highlights the category currently
on screen · footer with a scrolling ticker.

Ships with 24 sample products **and 24 dummy product images**, so it looks finished
the moment you open it. Swap in your real photos when you have them.

---

## Files

```
index.html        the page, plus the inline SVG icon set
style.css         all styling, including the @font-face rules
app.js            banner slider, page rotation, ticker, category highlight, fallbacks
products.json     ← your products and prices (edit this)
settings.json     ← store details, promo lines, all board wording (edit this)
images/           logo, the two banner slides + 24 dummy product photos
fonts/            self-hosted Poppins + Caveat (.woff2)
admin.html        the admin panel — add/edit products in a browser
admin.css
admin.js
api/              the backend: products, settings, image upload, sign-in
scripts/seed.mjs  loads products.json into the database, once
package.json      backend dependencies
vercel.json       cache headers
prepare-photos.py turns a whole folder of phone photos into board-ready images
README.md         this file
reference.png     the design this board was built to match (safe to delete)
hero section.png  artwork from the old hero banner (safe to delete — unused)
slide 1.png       full-size sources for the two banner slides
slide 2 updated.png   (safe to delete — already converted into images/)
slide 2.png       the superseded second banner (safe to delete)
logo.jpeg         your original logo (safe to delete — already converted)
```

---

## 1. Test it locally before deploying

The page loads `products.json` over HTTP, so **double-clicking `index.html` will not
work** — browsers block file reads from `file://`. Start a tiny local server instead.

Open Terminal, go to this folder, and run:

```bash
npx serve .
```

Then open the address it prints, normally <http://localhost:3000>.

Any of these work equally well if you prefer:

```bash
python3 -m http.server 8000     # then open http://localhost:8000
php -S localhost:8000
```

Press `Ctrl + C` in the terminal to stop the server.

### Checking the timing — `?debug=1`

Add `?debug=1` to the URL:

```
http://localhost:3000/index.html?debug=1
```

A small overlay appears in the bottom-right corner showing the current page, the
seconds-per-page setting, a live countdown to the next page turn, the product count,
the TV's actual resolution, and whether the layout fits the screen. Use it when first
setting the board up on the real TV, then drop the flag — without it there is no
visible UI at all besides the page counter.

---

## 2. Deploy

**Deploying to Vercel? Skip to section 4** — that sets up the board *and* the online
admin panel in one go, and is the right path if you want to change prices without
redeploying.

This section covers the simplest possible deploy: the board only, as static files, by
dragging a folder. It gives you a working TV board in two minutes, but the admin panel
will only edit your local copy — the `api/` backend needs Vercel (Netlify uses a
different function format and will ignore it).

### Netlify (drag and drop, no CLI)

1. Go to <https://app.netlify.com/drop> and sign in (a free account is enough).
2. Open Finder and find this project folder (the one containing `index.html`).
3. **Drag the whole folder** onto the dashed drop area in the browser.
   Drag the *folder itself*, not the files inside it, and do not zip it.
4. Netlify uploads it and gives you a URL like
   `https://shiny-name-123456.netlify.app`. That is your TV address.
5. Optional but recommended — rename it to something you can type on a TV remote:
   **Site configuration → Change site name**, e.g. `safdar-sons-board`, which gives
   you `https://safdar-sons-board.netlify.app`.

> Keep that URL somewhere safe — you will re-open this same page to redeploy later.

### Static-only on Vercel

Use this only if you do *not* want the backend. For the full thing, use section 4.

1. Go to <https://vercel.com/new> and sign in.
2. Pick the option to deploy without a Git repository — on the New Project screen
   choose **Deploy a template → Other**, or go straight to
   <https://vercel.com/new/clone> and use the drag-and-drop upload area.
3. Drag the project folder in, give the project a name such as `safdar-sons-board`,
   and click **Deploy**.
4. You get a URL like `https://safdar-sons-board.vercel.app`.

Either way, this static route means prices change by editing the files and
redeploying. **Section 4 removes that step.**

---

## 3. Open it on the Android TV

1. Open the TV's browser (often **Internet**, **Web Browser**, or **Puffin TV** —
   install one from the Play Store if your TV has none).
2. Type the deployed URL into the address bar. It is worth bookmarking it or
   setting it as the browser's homepage so it reloads to the board after a power cut.
3. Go **fullscreen / immersive mode** so the address bar and the TV's status bar are
   hidden:
   - Most Android TV browsers have a **Fullscreen** or **Immersive mode** item in the
     browser's **⋮ menu** or **Settings**. Turn it on.
   - Some browsers instead use a **Desktop / Fullscreen** toggle in the toolbar.
   - Puffin TV: **Menu → Settings → Fullscreen**.
4. Leave it. The board rotates on its own — there is nothing to press.

**Two TV settings worth changing for unattended use:**

- Turn off the screensaver: **Settings → Device Preferences → Screensaver →** set
  "Start screensaver" to **Never**.
- Turn off auto-sleep: **Settings → Device Preferences → Power / Energy saver →**
  disable the "switch off after N minutes of inactivity" option. The TV sees no
  remote input all day and would otherwise sleep.

The page reloads itself every 12 hours (`reloadHours` in `settings.json`) to keep
long-running TV browsers healthy, and re-checks the JSON files every 15 minutes
(`refreshMinutes`), so new prices appear on the TV without anyone touching it.

---

## 4. The backend — already live

This is deployed and running. You do not need to set it up again.

| | |
|---|---|
| **Board (for the TV)** | https://safdar-sons-board.vercel.app |
| **Admin panel** | https://safdar-sons-board.vercel.app/admin.html |
| **Password** | `SafdarMart@123` — change it, see below |
| Database | Neon Postgres `neon-violet-diamond` — holds the products |
| Image store | Vercel Blob `safdar-board-images` — holds uploaded photos |
| Project | `safdar-sons-board` on Vercel, auto-deploys from `main` |

Open the admin panel on your phone, sign in, change a price, hit **Save changes**.
The TV picks it up within about a minute. Nothing to redeploy.

### Changing the password

```bash
vercel env rm ADMIN_PASSWORD production
vercel env add ADMIN_PASSWORD production      # type the new one
vercel deploy --prod
```

### If you ever rebuild this from scratch

### One-time setup

Run these from the project folder. It takes about five minutes.

```bash
# 1. sign in and link the folder to a Vercel project
vercel login
vercel link

# 2. add the database (pick the free plan when asked)
vercel integration add neon

# 3. add the image store
vercel blob create-store safdar-board-images

# 4. set your admin password and a signing secret
#    pick a long password — it is the only thing protecting the panel
vercel env add ADMIN_PASSWORD production
vercel env add SESSION_SECRET production        # paste the output of: npm run secret

# 5. load your current 24 products into the database
vercel env pull .env.local
npm install
npm run seed

# 6. ship it
vercel deploy --prod
```

`npm run secret` prints a fresh random signing secret — paste that into step 4 when
it asks for `SESSION_SECRET`. Do not reuse your password for it.

> **Add the two env vars to Preview and Development too** if you want `vercel dev` to
> work locally: repeat step 4 with `preview` and `development` in place of
> `production`, or set them once in **Project → Settings → Environment Variables**
> with all three environments ticked.

### After that

- **Board:** `https://your-project.vercel.app/`
- **Admin:** `https://your-project.vercel.app/admin.html`

Bookmark the admin URL on your phone — it works fine on a phone screen.

### How changes reach the TV

You save in the admin panel → the API writes to Neon and Blob → the board re-checks
every `refreshMinutes` (15 by default) and swaps the new prices in at the next page
turn. To make it quicker, lower `refreshMinutes` to `1` in your settings.

### If something is not set up yet

The board and panel degrade instead of breaking:

- **No database attached** — the board falls back to the bundled `products.json`, and
  the admin panel goes back to editing local files. Nothing goes blank on the TV.
- **No `ADMIN_PASSWORD`** — the panel refuses to sign anyone in, rather than letting
  everyone in.
- **No Blob store** — everything works except uploading new photos.

Add `?debug=1` to the board URL — the overlay shows `source api` or
`source static files`, so you can see which one it is using.

### Keeping it safe

- The password is the whole lock. Use something long and random, not the shop phone
  number. Change it with `vercel env rm ADMIN_PASSWORD production` then `add` again.
- Sign-in survives 12 hours, then asks again.
- `GET /api/products` is public — that is just your price list, the same thing the TV
  shows. Everything that **writes** requires the session cookie.
- If you ever need separate logins for different staff, that is the point to move to a
  real auth provider (Clerk installs through the Vercel Marketplace).

---

## 5. The admin panel — adding and editing products

Open **`admin.html`** to manage products in a browser instead of editing JSON by hand.
Once the backend from section 4 is live, use the deployed URL
(`https://your-project.vercel.app/admin.html`) and your changes go straight to the TV.

Without a backend it still works against the local files. Run it from the local server:

```bash
npx serve .
```

then open <http://localhost:3000/admin.html>.

You get a list of every product on the left, and an editor on the right with a **live
preview of the card exactly as the TV draws it**. You can:

- **Add a product** — photo, name, pack size, category, price, and an optional "was"
  price
- **Edit or delete** any existing product
- **Reorder** with the ↑ ↓ buttons — the list is split into pages of 6 with a heading
  for each, so you can see which products land on which page
- Drop in a photo and it is **trimmed, centred on white and saved as a 700 × 700 JPEG**
  automatically — the same treatment `prepare-photos.py` applies

**The discount badge fills itself in.** Type a price and a "was" price and the
percentage is worked out for you. Clear the percentage box to hide the red badge on
that card, even when both prices are set.

### Saving your changes

**Deployed, with the backend from section 4** — sign in, hit **Save changes**, done.
Photos upload to Blob and the prices go to the database. The TV updates itself; there
is nothing to redeploy.

The two options below are what happens when there is **no** backend yet.

**In Chrome or Edge** — click **Connect project folder** once and pick the folder
containing `index.html`. From then on **Save changes** writes `products.json` and any
new photos straight into your project. Nothing to move by hand.

**In Safari or Firefox** — those browsers cannot write to a folder, so **Save changes**
hands you the files as downloads instead. Put `products.json` in the project folder and
the photos in `images/`, replacing what is there.

Either way the last step is the same: **redeploy** by dragging the folder to Netlify
(see section 2), otherwise the TV keeps showing the old prices.

> The panel only ever edits your local copy — it cannot change the live site by itself,
> and there is no login because there is nothing behind it to protect. If you would
> rather it not be on the public URL at all, delete `admin.html`, `admin.css` and
> `admin.js` before you deploy; the board does not use them.

---

## 6. Updating prices and products later

Everything you will ever change day-to-day is in the two JSON files. Edit them in any
plain text editor (TextEdit in **Format → Make Plain Text**, or VS Code).

### `products.json`

A list of products, **6 per page**. Supports 20 to 50 products (4 to 9 pages).

```json
[
  {
    "name": "Panadol 500mg Tablets",
    "size": "20s",
    "category": "Medicines",
    "image": "images/panadol.jpg",
    "oldPrice": 150,
    "newPrice": 120,
    "discountPercent": 20,
    "currency": "Rs."
  }
]
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | The **first word is shown in bold**, matching the reference card style |
| `size` | no | Pack size. Printed in brackets after the name — `20s` → "… Tablets (20s)" |
| `category` | no | Lights up the matching tile in the category strip. Must match a `label` in `settings.categories` |
| `image` | no | Path to the photo. Leave it out, or leave the file missing, and a soft tinted block with the product name appears instead |
| `oldPrice` | no | Shown above the price plate with a red line struck through it. Omit for a plain, non-discounted price |
| `newPrice` | yes | The lime number in the green price plate |
| `discountPercent` | no | **The red "% OFF" badge only appears when this is present.** Omit it and no badge is drawn |
| `currency` | no | Defaults to the `currency` in `settings.json` (`Rs.`) |

Prices should be plain numbers — write `1250`, not `"Rs. 1,250"`. The board adds the
currency and the thousands separator for you.

> **Keep each page of 6 in one category.** Products are paged in file order, so
> products 1–6 are page 1, 7–12 are page 2, and so on. The sample file groups them as
> Medicines / Personal Care / Baby Care / Health & Wellness, which is what makes the
> category strip highlight the right tile on each page. Mixed pages still work — the
> most common category on that page wins.

### `settings.json`

Two groups of settings: the ones you will actually change, and the board wording you
can set once and forget.

**Day-to-day**

```json
{
  "address": "Main Bazaar Road, Near Civil Hospital, Lahore",
  "phone": "0300-1234567",
  "promoLines": [
    "Free home delivery on orders above Rs. 2,000",
    "Open 7 days a week, 9:00 AM to 11:00 PM"
  ],
  "offersValidTill": "30 Apr 2025",
  "secondsPerPage": 8
}
```

- `secondsPerPage` — how long each row of 6 stays up. 8 is a good default; raise it
  to 10–12 if customers say it moves too fast.
- `promoLines` — add or remove as many as you like. They all scroll past in the
  footer ticker along with the address and phone number.
- `offersValidTill` — the date on the right of the TODAY'S DEALS bar. Set it to `""`
  to hide that whole line.

**Board wording** (set once)

| Key | Where it shows |
|---|---|
| `storeName`, `pharmacyLabel`, `martLabel` | The browser tab title |
| `tagline` | Falls back into the footer ticker when there is nothing else to scroll. `\n` splits it over two lines |
| `slides` | The banner pictures at the top of the board — see below |
| `slideSeconds` | How long each banner stays up before it crossfades. Default `8` |
| `dealsTitle`, `dealsScript`, `dealsNote` | The TODAY'S DEALS bar |
| `categories` | The tiles in the category strip |
| `categoryPanel` | "Good Health / Brighter Days" at the end of that strip |
| `footerTag`, `footerNote` | The two ends of the footer bar |
| `refreshMinutes`, `reloadHours` | How often the TV looks for new prices / fully reloads. Defaults are fine |

**Icon names** available for `categories`:
`shield`, `family`, `cart`, `heart`, `capsule`, `bottle`, `baby`, `pulse`,
`grocery`, `jar`, `bread`, `lotus`, `leaf`, `sun`.

> **Tip:** paste the file into <https://jsonlint.com> after editing. One missing comma
> will stop the board from loading, and it will sit on a "Loading offers…" screen.

### Redeploying after an edit

**Netlify:** open your site in the Netlify dashboard → **Deploys** tab → drag the
project folder onto the drop area at the bottom of that page ("Need to update your
site? Drag and drop your site folder here"). It replaces the live site on the same
URL within seconds.

**Vercel:** open the project → **Deployments** → **Create Deployment** → drag the
folder in.

The TV picks the change up within `refreshMinutes` (15 by default) — no need to touch
the TV. If you want it instantly, reload the page on the TV browser.

---

## 7. Adding real product photos

The 24 images in `images/` are **stylised placeholder mockups** — simple drawn packs
on a white background, there so the board looks complete before you have real photos.
Replace them at your own pace; the board does not care which are real.

### Getting real product photos

**Photograph your own stock.** It is the fastest route, it costs nothing, the images
are accurate to what you actually sell, and they are unambiguously yours to use.
Product photos you find on Google or on e-commerce sites belong to the brands and
are not licensed for you to redistribute on a public in-store display.

If you would rather have official brand photography, ask your **distributor or
supplier** — most keep a retailer image pack and will hand it over for in-store use.
That is the licensed route.

**Shooting them yourself — 20 minutes for all 24:**

1. Tape a sheet of plain white A4/A3 paper to a wall so it curves onto the table.
2. Stand near a window. Daylight from the side, no flash — flash blows out packaging.
3. Put one product in the middle, phone roughly level with the product, and fill
   most of the frame. Do not worry about centring it perfectly.
4. One photo per product. Name it exactly as `products.json` expects.

Run this to see the exact filenames to use:

```bash
python3 prepare-photos.py --list
```

**Then let the script clean them up.** Put every photo in a `photos-in/` folder and run:

```bash
python3 prepare-photos.py
```

It straightens each photo using the phone's rotation tag, crops away the empty space
around the product, centres it on a 700 x 700 white square, compresses it, and writes
it into `images/` — overwriting the placeholder. It then tells you which products are
still on a dummy image, so you can see what is left to shoot.

If a photo has a busy background (a shelf, a countertop) rather than plain paper:

```bash
python3 prepare-photos.py --cutout
```

That cuts the product out and drops it onto white. It works well for a single product
filling the frame; for anything complicated, re-shoot it on paper instead — that is
quicker than fighting it. `--cutout` needs one extra package:
`python3 -m pip install opencv-python`.

### Doing it by hand instead

You do not have to use the script. Any image works as long as it is roughly square
and on a white background:

| | |
|---|---|
| Aspect ratio | **Square (1:1)** — the card's image area is roughly square |
| Size | **700 x 700 px** (1000 x 1000 px for a 4K TV) |
| Background | **Plain white**, product centred with a little breathing room |
| Format | JPEG for photos, PNG if you need transparency |
| File size | Under ~150 KB each so the board loads fast on shop Wi-Fi |

Photos are displayed with "contain" scaling, so a photo that is not exactly square is
never cropped or stretched — it just letterboxes into the card. 4:3 and 3:4 both work
fine. Very wide or very tall photos will look small, so crop them closer to square.

**The easiest way to swap one in:** save your photo over the existing placeholder,
keeping the same filename (e.g. replace `images/panadol.jpg` with your own
`panadol.jpg`). Then you never touch `products.json` at all.

If a photo is missing, misspelled, or fails to download, that card shows a soft tinted
block with the product name instead. Nothing breaks, so you can add photos gradually.

### The logo

Two files, both already in place:

- **`images/logo-mark.png`** — the green S+S symbol, used in the admin panel header.
  Transparent background.
- **`images/logo.png`** — your full square logo, used as the browser tab icon.

To replace them, overwrite the files with the same names. `logo-mark.png` should be
the symbol only, on a transparent background, roughly 3:2 landscape.

### The banner slides

The strip across the top of the board is a slider. It shows each picture in `slides`
for `slideSeconds`, then crossfades to the next one and loops forever:

```json
"slides": ["images/slide-1.jpg", "images/slide-2.jpg"],
"slideSeconds": 8
```

Add a third entry for a seasonal banner, or cut the list down to one — with a single
slide the dots disappear and the picture simply stays put. A slide whose file is
missing drops out of the rotation on its own, so a typo never leaves a blank panel.

**The slot is 5.27:1** — far wider than it is tall. That is 1888 × 358 px on a 1080p
TV, 2832 × 537 at 1440p, 3776 × 716 at 4K; any of those ratios is the same shape, so
match the shape and pick the size from the screen you are running on.

A banner cut to 5.27:1 fills the panel edge to edge, which is what you want. Anything
narrower is never cropped — the whole picture is always shown, and a blurred, stretched
copy of the same artwork fills the space left over at the sides so the background of
the picture still runs through to the edges of the board. That fallback also covers
screens that are not 16:9, where the panel is a little wider than 5.27:1.

`images/slide-1.jpg` is the full 2.33:1 artwork, so it shows with those blurred sides.
`images/slide-2.jpg` was centre-cropped to 5.27:1 first, so it fills the panel — its
artwork sits in the middle of the frame with the leaf canopy and the table to spare
above and below, which is exactly what makes a crop like that possible:

```bash
python3 - <<'EOF'
from PIL import Image
im = Image.open('slide 2 updated.png').convert('RGB')
W, H = im.size
band = round(W / (118/22.375))          # the panel's aspect ratio
im.crop((0, (H-band)//2, W, (H-band)//2 + band)).save(
    'images/slide-2.jpg', quality=88, optimize=True, progressive=True)
EOF
```

Slide 1 cannot take the same crop: its headline and its lower row of bottles run the
full height of the frame, so trimming to 5.27:1 slices through both. To make it fill
the panel too, it needs re-exporting at 5.27:1 rather than cropping.

For a slide that keeps its full height, macOS `sips` converts a PNG source without
cropping — full resolution, JPEG quality 88, which takes 2.3 MB down to about 660 KB:

```bash
sips -s format jpeg -s formatOptions 88 "slide 1.png" --out images/slide-1.jpg
```

---

## 8. Design notes

Colours are defined once at the top of `style.css` under `:root`, sampled from
`reference.png`:

| Token | Colour | Used for |
|---|---|---|
| `--page-1` / `--page-2` | `#F3F7F4` → `#E2ECE4` | Board background |
| `--dark` | `#013D24` | Slider backdrop, angled panels, footer tag |
| `--green` | `#0E802F` | Price plate, active category tile |
| `--lime` | `#C6E85C` | Prices, the active slider dot |
| `--red` | `#E12E2B` | Discount badge |
| `--card` | `#FFFFFF` | Product cards |

**Fonts are self-hosted** in `fonts/` and loaded with `@font-face` from your own
domain — the board never calls the Google Fonts CDN, so it still renders correctly if
the TV's connection to outside services is unreliable. **Poppins** (400–800) carries
all the structural type; **Caveat** is the handwritten script used for "Your Health
Our Priority", "More Than a Pharmacy", and "Same Care. Better Savings."

Every icon on the board is inline SVG defined at the top of `index.html` — no icon
font, no image requests.

Every size on the page is derived from one root font size tied to the 16:9 viewport,
so the whole board scales as one piece on any TV resolution rather than reflowing.
Verified at 1280×720, 1366×768, 1920×1080 and 3840×2160 with no overflow.

The only animations are the 400 ms page crossfade and the footer ticker.
