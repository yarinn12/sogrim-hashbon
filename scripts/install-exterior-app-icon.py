from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "brand" / "app-icon-exterior-2026.png"


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


def install_web_and_store_icons(source: Image.Image) -> None:
    save_resized(source, ROOT / "app-icon-exterior-192.png", 192)
    save_resized(source, ROOT / "app-icon-exterior-512.png", 512)
    save_resized(source, ROOT / "app-icon-exterior-maskable-512.png", 512)
    save_resized(source, ROOT / "apple-touch-icon.png", 180)
    save_resized(source, ROOT / "docs" / "store-assets" / "app-icon-1024.png", 1024)
    save_resized(source, ROOT / "docs" / "store-assets" / "google-play-icon-512.png", 512)


def install_ios_icon(source: Image.Image) -> None:
    save_resized(
        source,
        ROOT
        / "ios"
        / "App"
        / "App"
        / "Assets.xcassets"
        / "AppIcon.appiconset"
        / "AppIcon-512@2x.png",
        1024,
    )


def install_android_icons(source: Image.Image) -> None:
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
        save_resized(source, destination / "ic_launcher.png", legacy_size)
        save_round(source, destination / "ic_launcher_round.png", legacy_size)
        if adaptive_size:
            save_resized(source, destination / "ic_launcher_foreground.png", adaptive_size)


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    if source.size != (1024, 1024):
        raise ValueError("Exterior app icon must be exactly 1024x1024 pixels.")

    install_web_and_store_icons(source)
    install_ios_icon(source)
    install_android_icons(source)
    print("Exterior app icon installed for web, Android, iOS, and store assets.")


if __name__ == "__main__":
    main()
