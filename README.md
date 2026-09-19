# Safdar & Sons Pharmacy + Mart — In-Store Signage Board

A single-page offer board for the shop TV, built to match `reference.png`. Plain
HTML/CSS/JS — no build step, no framework, no server code. Drop the folder on any
static host, open the URL on the Android TV browser, and it runs forever on its own.

**Layout, top to bottom:** logo lockup + handwritten tagline + trust badges + live
clock · EVERYDAY ESSENTIALS hero banner · TODAY'S DEALS bar · **one row of 6 product
cards** that crossfades to the next 6 every few seconds · category strip that
highlights the category currently on screen · footer with a scrolling ticker.

Ships with 24 sample products **and 24 dummy product images**, so it looks finished
the moment you open it. Swap in your real photos when you have them.

---

## Files

```
index.html        the page, plus the inline SVG icon set
style.css         all styling, including the @font-face rules
app.js            rotation, clock, ticker, category highlight, image fallbacks
products.json     ← your products and prices (edit this)
settings.json     ← store details, promo lines, all board wording (edit this)
images/           logo, hero artwork + 24 dummy product photos
fonts/            self-hosted Poppins + Caveat (.woff2)
README.md         this file
reference.png     the design this board was built to match (safe to delete)
hero section.png  the original hero artwork (safe to delete — already cut out)
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

## 2. Deploy to Netlify (drag and drop, no CLI)

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

### The same thing on Vercel

1. Go to <https://vercel.com/new> and sign in.
2. Pick the option to deploy without a Git repository — on the New Project screen
   choose **Deploy a template → Other**, or go straight to
   <https://vercel.com/new/clone> and use the drag-and-drop upload area.
3. Drag the project folder in, give the project a name such as `safdar-sons-board`,
   and click **Deploy**.
4. You get a URL like `https://safdar-sons-board.vercel.app`.

Netlify Drop is the simpler of the two for a folder with no Git repo, so start there
unless you already use Vercel.

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

## 4. Updating prices and products later

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
| `storeName`, `pharmacyLabel`, `martLabel` | The header logo lockup |
| `tagline` | The handwritten line next to the logo. `\n` splits it over two lines |
| `trustBadges` | The four icon + label items across the header |
| `headerPanel` | "Better Care / Brighter Lives" in the dark panel with the clock |
| `heroTitleTop`, `heroTitleBottom`, `heroSubline` | "EVERYDAY / ESSENTIALS" and the line under it |
| `heroScript`, `heroBadge` | The two panels on the right of the hero banner |
| `heroImage` | Optional hero photo — see below |
| `dealsTitle`, `dealsScript`, `dealsNote` | The TODAY'S DEALS bar |
| `categories` | The tiles in the category strip |
| `categoryPanel` | "Good Health / Brighter Days" at the end of that strip |
| `footerTag`, `footerNote` | The two ends of the footer bar |
| `refreshMinutes`, `reloadHours` | How often the TV looks for new prices / fully reloads. Defaults are fine |

**Icon names** available for `trustBadges` and `categories`:
`shield`, `family`, `cart`, `heart`, `capsule`, `bottle`, `baby`, `pulse`,
`grocery`, `jar`, `lotus`, `leaf`, `sun`.

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

## 5. Adding real product photos

The 24 images in `images/` are **stylised dummy mockups** — simple drawn packs on a
white background, there so the board looks complete before you have real photos.
Replace them at your own pace; the board does not care which are real.

Drop your photos into the **`images/`** folder and point each product's `image` field
at the filename:

```json
"image": "images/panadol.jpg"
```

The name in `products.json` must match the file exactly, including capitals and the
`.jpg` / `.png` ending.

**Recommended photo specs:**

| | |
|---|---|
| Aspect ratio | **Square (1:1)** — the card's image area is roughly square |
| Size | **700 × 700 px** (1000 × 1000 px if you want it sharp on a 4K TV) |
| Background | **Plain white**, product centred with a little breathing room |
| Format | JPEG for photos, PNG if you need transparency |
| File size | Keep under ~150 KB each so the board loads fast on shop Wi-Fi |

Photos are displayed with "contain" scaling, so a photo that is not exactly square is
never cropped or stretched — it just letterboxes into the card. 4:3 and 3:4 both work
fine. Very wide or very tall photos will look small, so crop them closer to square.

**The easiest way to swap one in:** save your photo over the existing dummy file,
keeping the same filename (e.g. replace `images/panadol.jpg` with your own
`panadol.jpg`). Then you do not need to touch `products.json` at all.

If a photo is missing, misspelled, or fails to download, that card shows a soft tinted
block with the product name instead. Nothing breaks, so you can add photos gradually.

### The logo

Two files, both already in place:

- **`images/logo-mark.png`** — just the green S+S symbol, used in the header lockup
  next to the "SAFDAR & SONS" wordmark. Transparent background.
- **`images/logo.png`** — your full square logo, used as the browser tab icon.

To replace them, overwrite the files with the same names. `logo-mark.png` should be
the symbol only, on a transparent background, roughly 3:2 landscape.

### The hero photo

**`images/hero.png`** is the artwork in the green banner — your S+S product-bag photo,
cut out of its background so it sits directly on the banner's green gradient. It was
made from `hero section.png`; the two handwritten lines in that original are rendered
by the board as live text instead, so they stay crisp at any resolution and can be
edited in `settings.json`.

To swap it for a different picture — a shelf shot, a seasonal promo — save a
**transparent PNG** as `images/hero.png`, roughly 760 × 480 px. Point `heroImage` at a
different filename if you prefer. Delete the file and a drawn shopping-bag
illustration takes its place, so the banner is never empty.

---

## 6. Design notes

Colours are defined once at the top of `style.css` under `:root`, sampled from
`reference.png`:

| Token | Colour | Used for |
|---|---|---|
| `--page-1` / `--page-2` | `#F3F7F4` → `#E2ECE4` | Board background |
| `--dark` | `#013D24` | Hero, angled panels, footer tag |
| `--green` | `#0E802F` | Price plate, active category tile |
| `--lime` | `#C6E85C` | Prices, "ESSENTIALS", the clock |
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
