from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "brand" / "app-icon-exterior-2026.png"
ANDROID_BACKGROUND = (9, 47, 38)


def full_bleed_artwork(source: Image.Image, mark: Image.Image) -> Image.Image:
    """Build an unmasked square icon while preserving the supplied mark."""
    # Apple and store launchers apply their own mask. Use the source leather as
    # a full-bleed background, then place the original mark with optical room on
    # every side. This avoids both the previous white halo and a double-rounded
    # border after the platform applies its own mask.
    texture = source.crop((160, 32, 864, 248)).resize(
        source.size,
        Image.Resampling.LANCZOS,
    ).convert("RGBA")
    target = round(source.width * 0.82)
    scale = min(target / mark.width, target / mark.height)
    fitted = mark.resize(
        (max(1, round(mark.width * scale)), max(1, round(mark.height * scale))),
        Image.Resampling.LANCZOS,
    )
    texture.alpha_composite(
        fitted,
        ((source.width - fitted.width) // 2, (source.height - fitted.height) // 2),
    )
    return texture.convert("RGB")


def android_foreground_mark(source: Image.Image) -> Image.Image:
    """Extract the infinity-and-receipt mark for Android adaptive launchers."""
    pixels = np.asarray(source.convert("RGB"))
    red = pixels[:, :, 0]
    green = pixels[:, :, 1]
    blue = pixels[:, :, 2]
    y, x = np.indices((source.height, source.width))

    loop = (
        (x >= 70)
        & (x <= 954)
        & (y >= 225)
        & (y <= 725)
        & (green >= 54)
        & ((green.astype(np.int16) - red.astype(np.int16)) >= 34)
        & ((green.astype(np.int16) - blue.astype(np.int16)) >= 5)
    )
    loop_mask = Image.fromarray(np.where(loop, 255, 0).astype(np.uint8), "L")
    loop_mask = loop_mask.filter(ImageFilter.MaxFilter(5)).filter(
        ImageFilter.GaussianBlur(1.1)
    )

    receipt_mask = Image.new("L", source.size, 0)
    ImageDraw.Draw(receipt_mask).polygon(
        [
            (357, 548),
            (667, 548),
            (667, 921),
            (628, 960),
            (590, 922),
            (551, 960),
            (513, 922),
            (475, 960),
            (437, 922),
            (399, 960),
            (357, 921),
        ],
        fill=255,
    )
    receipt_mask = receipt_mask.filter(ImageFilter.GaussianBlur(0.8))

    mark_mask = ImageChops.lighter(loop_mask, receipt_mask)
    mark = source.convert("RGBA")
    mark.putalpha(mark_mask)
    bounds = mark_mask.getbbox()
    if not bounds:
        raise ValueError("Could not extract the Android launcher mark.")
    padding = 8
    left, top, right, bottom = bounds
    return mark.crop(
        (
            max(0, left - padding),
            max(0, top - padding),
            min(source.width, right + padding),
            min(source.height, bottom + padding),
        )
    )


def adaptive_foreground(mark: Image.Image, size: int) -> Image.Image:
    """Fit critical Android artwork into the guaranteed 66/108 safe zone."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    safe_size = round(size * (66 / 108))
    scale = min(safe_size / mark.width, safe_size / mark.height)
    fitted = mark.resize(
        (max(1, round(mark.width * scale)), max(1, round(mark.height * scale))),
        Image.Resampling.LANCZOS,
    )
    offset = ((size - fitted.width) // 2, (size - fitted.height) // 2)
    canvas.alpha_composite(fitted, offset)
    return canvas


def adaptive_composite(mark: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (*ANDROID_BACKGROUND, 255))
    canvas.alpha_composite(adaptive_foreground(mark, size))
    return canvas.convert("RGB")


def monochrome_foreground(mark: Image.Image, size: int) -> Image.Image:
    foreground = adaptive_foreground(mark, size)
    alpha = foreground.getchannel("A")
    monochrome = Image.new("RGBA", foreground.size, (0, 0, 0, 0))
    monochrome.putalpha(alpha)
    return monochrome


def save_resized(source: Image.Image, path: Path, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    source.resize((size, size), Image.Resampling.LANCZOS).save(
        path,
        "PNG",
        optimize=True,
    )


def save_round(source: Image.Image, path: Path, size: int) -> None:
    resized = source.resize((size, size), Image.Resampling.LANCZOS).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    resized.putalpha(mask)
    path.parent.mkdir(parents=True, exist_ok=True)
    resized.save(path, "PNG", optimize=True)


def install_web_and_store_icons(
    artwork: Image.Image,
    mark: Image.Image,
) -> None:
    save_resized(artwork, ROOT / "app-icon-exterior-192.png", 192)
    save_resized(artwork, ROOT / "app-icon-exterior-512.png", 512)
    adaptive_composite(mark, 512).save(
        ROOT / "app-icon-exterior-maskable-512.png",
        "PNG",
        optimize=True,
    )
    save_resized(artwork, ROOT / "apple-touch-icon.png", 180)
    save_resized(artwork, ROOT / "docs" / "store-assets" / "app-icon-1024.png", 1024)
    save_resized(artwork, ROOT / "docs" / "store-assets" / "google-play-icon-512.png", 512)


def install_ios_icon(artwork: Image.Image) -> None:
    save_resized(
        artwork,
        ROOT
        / "ios"
        / "App"
        / "App"
        / "Assets.xcassets"
        / "AppIcon.appiconset"
        / "AppIcon-512@2x.png",
        1024,
    )


def install_android_icons(artwork: Image.Image, mark: Image.Image) -> None:
    android_res = ROOT / "android" / "app" / "src" / "main" / "res"
    icon_sizes = {
        "mipmap-ldpi": (36, None),
        "mipmap-mdpi": (48, 108),
        "mipmap-hdpi": (72, 162),
        "mipmap-xhdpi": (96, 216),
        "mipmap-xxhdpi": (144, 324),
        "mipmap-xxxhdpi": (192, 432),
    }

    for folder, (legacy_size, adaptive_size) in icon_sizes.items():
        destination = android_res / folder
        save_resized(artwork, destination / "ic_launcher.png", legacy_size)
        save_round(artwork, destination / "ic_launcher_round.png", legacy_size)
        if adaptive_size:
            adaptive_foreground(mark, adaptive_size).save(
                destination / "ic_launcher_foreground.png",
                "PNG",
                optimize=True,
            )
            monochrome_foreground(mark, adaptive_size).save(
                destination / "ic_launcher_monochrome.png",
                "PNG",
                optimize=True,
            )


def install_android_background() -> None:
    background = ROOT / "android" / "app" / "src" / "main" / "res" / "values" / "ic_launcher_background.xml"
    background.write_text(
        """<?xml version=\"1.0\" encoding=\"utf-8\"?>
<resources>
    <color name=\"ic_launcher_background\">#092F26</color>
</resources>
""",
        encoding="utf-8",
    )


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    if source.size != (1024, 1024):
        raise ValueError("Exterior app icon must be exactly 1024x1024 pixels.")

    mark = android_foreground_mark(source)
    artwork = full_bleed_artwork(source, mark)
    install_web_and_store_icons(artwork, mark)
    install_ios_icon(artwork)
    install_android_icons(artwork, mark)
    install_android_background()
    print("Exterior app icon installed for web, Android, iOS, and store assets.")


if __name__ == "__main__":
    main()
