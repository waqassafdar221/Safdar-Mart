#!/usr/bin/env python3
"""
prepare-photos.py — turn raw phone photos into board-ready product images.

Drop your photos into  photos-in/  named after the product, run this script,
and it writes clean 700x700 images on a white background into  images/ .

    python3 prepare-photos.py                # straighten, trim, centre on white
    python3 prepare-photos.py --cutout       # also remove a busy background
    python3 prepare-photos.py --list         # show the filenames products.json wants

What it does to each photo:
  * applies the phone's rotation tag, so portrait shots are not sideways
  * finds the product and crops away the empty space around it
  * centres it on a square white canvas with an even margin
  * resizes to 700x700 and saves an optimised JPEG

Requires Pillow (and OpenCV only for --cutout):
    python3 -m pip install pillow opencv-python
"""
import argparse
import json
import os
import sys

try:
    from PIL import Image, ImageOps, ImageFilter
except ImportError:
    sys.exit("Pillow is not installed.  Run:  python3 -m pip install pillow")

IN_DIR = "photos-in"
OUT_DIR = "images"
SIZE = 700          # final square size, matches the card's image area
MARGIN = 0.07       # empty space kept around the product, as a fraction of SIZE
EXTS = (".jpg", ".jpeg", ".png", ".heic", ".webp", ".bmp", ".tif", ".tiff")


# ----------------------------------------------------------------- helpers
def wanted_filenames():
    """The image filenames products.json is pointing at."""
    try:
        with open("products.json", encoding="utf-8") as fh:
            products = json.load(fh)
    except Exception:
        return []
    out = []
    for p in products:
        img = p.get("image")
        if img:
            out.append((os.path.basename(img), p.get("name", "")))
    return out


def trim_to_product(img, tol=18):
    """Crop away a plain border (white/grey studio background) around the product."""
    grey = img.convert("L")
    w, h = grey.size
    # background colour sampled from the four corners
    corners = [grey.getpixel(p) for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    bg = sum(corners) / 4
    mask = grey.point(lambda v: 255 if abs(v - bg) > tol else 0)
    mask = mask.filter(ImageFilter.MedianFilter(5))     # ignore dust and noise
    box = mask.getbbox()
    if not box:
        return img
    # never crop away more than 96% — that would mean detection failed
    if (box[2] - box[0]) < w * 0.04 or (box[3] - box[1]) < h * 0.04:
        return img
    return img.crop(box)


def cutout(img):
    """Remove a busy background with GrabCut, then flatten onto white."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        print("    (--cutout needs OpenCV: python3 -m pip install opencv-python)")
        return img

    import numpy as np
    bgr = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]
    rect = (int(w * .06), int(h * .06), int(w * .88), int(h * .88))
    mask = np.zeros((h, w), np.uint8)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(bgr, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
    except cv2.error:
        return img
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    if n > 1:                                        # keep the main subject only
        fg = np.where(lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]), 255, 0).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))

    alpha = Image.fromarray(fg).filter(ImageFilter.GaussianBlur(1.2))
    flat = Image.new("RGB", img.size, (255, 255, 255))
    flat.paste(img, (0, 0), alpha)
    return flat


def square_on_white(img):
    """Fit the product into a square white canvas with an even margin."""
    inner = int(SIZE * (1 - 2 * MARGIN))
    copy = img.copy()
    copy.thumbnail((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGB", (SIZE, SIZE), (255, 255, 255))
    canvas.paste(copy, ((SIZE - copy.width) // 2, (SIZE - copy.height) // 2))
    return canvas


# -------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="Prepare product photos for the signage board.")
    ap.add_argument("--cutout", action="store_true",
                    help="remove a busy background (needs opencv-python)")
    ap.add_argument("--list", action="store_true",
                    help="list the filenames products.json expects, then exit")
    ap.add_argument("--in", dest="src", default=IN_DIR, help="input folder")
    ap.add_argument("--out", dest="dst", default=OUT_DIR, help="output folder")
    args = ap.parse_args()

    if args.list:
        rows = wanted_filenames()
        if not rows:
            sys.exit("Could not read products.json from this folder.")
        print("Name your photos like this (put them in %s/):\n" % IN_DIR)
        for fn, name in rows:
            print("  %-26s  %s" % (fn, name))
        print("\n%d images referenced." % len(rows))
        return

    if not os.path.isdir(args.src):
        os.makedirs(args.src, exist_ok=True)
        sys.exit("Created %s/ — put your photos in there and run this again.\n"
                 "Run  python3 prepare-photos.py --list  to see the filenames to use."
                 % args.src)

    os.makedirs(args.dst, exist_ok=True)
    files = sorted(f for f in os.listdir(args.src)
                   if f.lower().endswith(EXTS) and not f.startswith("."))
    if not files:
        sys.exit("No photos found in %s/" % args.src)

    expected = {fn for fn, _ in wanted_filenames()}
    done, unmatched = 0, []

    for f in files:
        src = os.path.join(args.src, f)
        try:
            img = Image.open(src)
            img = ImageOps.exif_transpose(img)       # honour the phone's rotation
            img = img.convert("RGB")
        except Exception as e:
            print("  skip %-26s (%s)" % (f, e))
            continue

        if args.cutout:
            img = cutout(img)
        img = trim_to_product(img)
        img = square_on_white(img)

        out_name = os.path.splitext(f)[0] + ".jpg"
        img.save(os.path.join(args.dst, out_name), quality=88, optimize=True)
        kb = os.path.getsize(os.path.join(args.dst, out_name)) / 1024
        flag = "" if out_name in expected else "   <- not referenced by products.json"
        if flag:
            unmatched.append(out_name)
        print("  %-26s %4.0f KB%s" % (out_name, kb, flag))
        done += 1

    print("\n%d photo%s written to %s/" % (done, "" if done == 1 else "s", args.dst))
    if unmatched:
        print("\nThese filenames do not match products.json. Either rename them, or\n"
              "point the product's \"image\" field at them:")
        for u in unmatched:
            print("   %s" % u)
    missing = expected - set(os.listdir(args.dst))
    if missing:
        print("\nStill using the dummy image for: %s" % ", ".join(sorted(missing)))


if __name__ == "__main__":
    main()
