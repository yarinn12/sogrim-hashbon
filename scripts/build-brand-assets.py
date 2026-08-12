from base64 import b64encode
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "brand" / "sogrim-logo-2026-source.png"
BACKGROUND = (255, 255, 255, 255)


def content_mask(image, threshold=248):
    pixels = np.asarray(image.convert("RGB"))
    return pixels.min(axis=2) < threshold


def padded_bbox(mask, padding, width, height):
    ys, xs = np.where(mask)
    if not len(xs):
        return 0, 0, width, height
    return (
        max(0, int(xs.min()) - padding),
        max(0, int(ys.min()) - padding),
        min(width, int(xs.max()) + 1 + padding),
        min(height, int(ys.max()) + 1 + padding),
    )


def source_lockup(source):
    mask = content_mask(source)
    return source.crop(padded_bbox(mask, 28, source.width, source.height)).convert("RGBA")


def source_mark(source):
    pixels = np.asarray(source.convert("RGBA"))
    base_mask = content_mask(source)
    y, x = np.indices(base_mask.shape)

    # The arrow overlaps the wordmark horizontally, so isolate the mark by both
    # horizontal and vertical regions instead of using a single rectangular crop.
    mark_region = (x < source.width * 0.35) | (
        (x < source.width * 0.445) & (y < source.height * 0.43)
    )
    mark_mask = base_mask & mark_region
    crop_box = padded_bbox(mark_mask, 20, source.width, source.height)
    left, top, right, bottom = crop_box

    layer = np.zeros_like(pixels)
    layer[:, :, :3] = pixels[:, :, :3]
    layer[:, :, 3] = np.where(mark_mask, 255, 0).astype(np.uint8)
    return Image.fromarray(layer, "RGBA").crop((left, top, right, bottom))


def fit_image(image, width, height):
    scale = min(width / image.width, height / image.height)
    target = (
        max(1, round(image.width * scale)),
        max(1, round(image.height * scale)),
    )
    return image.resize(target, Image.Resampling.LANCZOS)


def place_center(canvas, image, center_y=None):
    x = (canvas.width - image.width) // 2
    y = ((canvas.height - image.height) // 2) if center_y is None else round(center_y - image.height / 2)
    canvas.alpha_composite(image, (x, y))
    return canvas


def icon_canvas(mark, size, occupancy=0.78, transparent=False):
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0) if transparent else BACKGROUND)
    fitted = fit_image(mark, round(size * occupancy), round(size * occupancy))
    return place_center(canvas, fitted)


def legacy_icon_canvas(mark, size, round_icon=False):
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inset = max(1, round(size * 0.06))
    bounds = (inset, inset, size - inset - 1, size - inset - 1)
    draw = ImageDraw.Draw(canvas)
    if round_icon:
        draw.ellipse(bounds, fill=BACKGROUND)
    else:
        draw.rounded_rectangle(bounds, radius=round(size * 0.2), fill=BACKGROUND)
    fitted = fit_image(mark, round(size * 0.62), round(size * 0.62))
    return place_center(canvas, fitted)


def social_card(lockup, width=1200, height=630):
    canvas = Image.new("RGBA", (width, height), BACKGROUND)
    fitted = fit_image(lockup, round(width * 0.9), round(height * 0.72))
    return place_center(canvas, fitted)


def splash(lockup, width, height):
    canvas = Image.new("RGBA", (width, height), BACKGROUND)
    fitted = fit_image(lockup, round(width * 0.82), round(height * 0.42))
    return place_center(canvas, fitted, center_y=height * 0.47)


def monochrome_mark(mark, size):
    fitted = fit_image(mark, round(size * 0.66), round(size * 0.66))
    source = np.asarray(fitted)
    alpha = source[:, :, 3]
    pixels = np.zeros_like(source)
    pixels[:, :, 3] = alpha
    monochrome = Image.fromarray(pixels, "RGBA")
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    return place_center(canvas, monochrome)


def save_png(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def save_jpeg(image, path, quality=92):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(path, "JPEG", quality=quality, optimize=True, progressive=True)


def write_embedded_svg(icon):
    output = BytesIO()
    icon.save(output, "PNG", optimize=True)
    payload = b64encode(output.getvalue()).decode("ascii")
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Sogrim Hashbon">
  <image width="1024" height="1024" href="data:image/png;base64,{payload}"/>
</svg>
"""
    (ROOT / "icon.svg").write_text(svg, encoding="utf-8")


def write_android_adaptive_icons():
    adaptive = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
"""
    destination = ROOT / "android" / "app" / "src" / "main" / "res" / "mipmap-anydpi-v26"
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "ic_launcher.xml").write_text(adaptive, encoding="utf-8")
    (destination / "ic_launcher_round.xml").write_text(adaptive, encoding="utf-8")


def update_store_screenshot_icons(master):
    store_assets = ROOT / "docs" / "store-assets"
    placements = (
        ("google-screenshot-*.png", (585, 65, 54)),
        ("apple-screenshot-*.png", (714, 92, 62)),
    )
    for pattern, (x, y, size) in placements:
        replacement = master.resize((size, size), Image.Resampling.LANCZOS)
        for path in store_assets.glob(pattern):
            screenshot = Image.open(path).convert("RGBA")
            screenshot.alpha_composite(replacement, (x, y))
            save_png(screenshot, path)


def build():
    source = Image.open(SOURCE).convert("RGBA")
    lockup = source_lockup(source)
    mark = source_mark(source)

    master = icon_canvas(mark, 1024)
    transparent_master = icon_canvas(mark, 1024, transparent=True)
    maskable = icon_canvas(mark, 512, occupancy=0.62)
    share = social_card(lockup)

    for path in (
        ROOT / "brand-mark.png",
        ROOT / "brand-mark-v2.png",
        ROOT / "brand-mark-v3.png",
        ROOT / "assets" / "icon-only.png",
        ROOT / "assets" / "brand" / "brand-mark-master.png",
        ROOT / "assets" / "brand" / "brand-mark-master-v4.png",
    ):
        save_png(master, path)
    save_png(transparent_master, ROOT / "assets" / "brand" / "brand-mark-transparent.png")
    save_png(lockup, ROOT / "sogrim-logo-lockup.png")
    save_png(lockup, ROOT / "assets" / "brand" / "sogrim-lockup-master-v2.png")
    save_png(share, ROOT / "sogrim-share-logo.png")
    save_png(icon_canvas(mark, 192), ROOT / "icon-192.png")
    save_png(icon_canvas(mark, 512), ROOT / "icon-512.png")
    save_png(maskable, ROOT / "icon-maskable-512.png")
    save_png(icon_canvas(mark, 180), ROOT / "apple-touch-icon.png")
    save_png(splash(lockup, 2732, 2732), ROOT / "assets" / "splash.png")
    save_jpeg(social_card(lockup, 960, 540), ROOT / "assets" / "sogrim-logo-intro-hold.jpg")
    write_embedded_svg(master)

    ios_assets = ROOT / "ios" / "App" / "App" / "Assets.xcassets"
    save_png(master, ios_assets / "AppIcon.appiconset" / "AppIcon-512@2x.png")
    native_splash = splash(lockup, 2732, 2732)
    for name in (
        "Default@1x~universal~anyany.png",
        "Default@2x~universal~anyany.png",
        "Default@3x~universal~anyany.png",
        "splash-2732x2732.png",
        "splash-2732x2732-1.png",
        "splash-2732x2732-2.png",
    ):
        save_png(native_splash, ios_assets / "Splash.imageset" / name)

    android_res = ROOT / "android" / "app" / "src" / "main" / "res"
    icon_sizes = {
        "mipmap-ldpi": (36, None),
        "mipmap-mdpi": (48, 108),
        "mipmap-hdpi": (72, 162),
        "mipmap-xhdpi": (96, 216),
        "mipmap-xxhdpi": (144, 324),
        "mipmap-xxxhdpi": (192, 432),
    }
    for folder, (legacy_size, foreground_size) in icon_sizes.items():
        destination = android_res / folder
        save_png(legacy_icon_canvas(mark, legacy_size), destination / "ic_launcher.png")
        save_png(
            legacy_icon_canvas(mark, legacy_size, round_icon=True),
            destination / "ic_launcher_round.png",
        )
        if foreground_size:
            save_png(
                icon_canvas(mark, foreground_size, occupancy=0.62, transparent=True),
                destination / "ic_launcher_foreground.png",
            )
            save_png(
                monochrome_mark(mark, foreground_size),
                destination / "ic_launcher_monochrome.png",
            )
    write_android_adaptive_icons()

    splash_sizes = {
        "drawable": (320, 480),
        "drawable-land-ldpi": (320, 240),
        "drawable-land-mdpi": (480, 320),
        "drawable-land-hdpi": (800, 480),
        "drawable-land-xhdpi": (1280, 720),
        "drawable-land-xxhdpi": (1600, 960),
        "drawable-land-xxxhdpi": (1920, 1280),
        "drawable-port-ldpi": (240, 320),
        "drawable-port-mdpi": (320, 480),
        "drawable-port-hdpi": (480, 800),
        "drawable-port-xhdpi": (720, 1280),
        "drawable-port-xxhdpi": (960, 1600),
        "drawable-port-xxxhdpi": (1280, 1920),
    }
    for folder, dimensions in splash_sizes.items():
        save_png(splash(lockup, *dimensions), android_res / folder / "splash.png")

    save_png(master, ROOT / "docs" / "store-assets" / "app-icon-1024.png")
    save_png(icon_canvas(mark, 512), ROOT / "docs" / "store-assets" / "google-play-icon-512.png")
    save_png(splash(lockup, 2732, 2732), ROOT / "docs" / "store-assets" / "launch-screen.png")
    update_store_screenshot_icons(master)


if __name__ == "__main__":
    build()
