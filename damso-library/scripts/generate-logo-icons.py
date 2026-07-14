from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
LOGO_DIR = ROOT / "public" / "logo"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
LOGO_BACKGROUND = (233, 229, 221, 255)
LOGO_CONTENT_SCALE = 0.9

preferred_source = LOGO_DIR / "logo-source.jpg"
source_candidates = (
    [preferred_source] if preferred_source.exists() else []
) + sorted(LOGO_DIR.glob("*.jpg")) + sorted(LOGO_DIR.glob("*.jpeg")) + sorted(LOGO_DIR.glob("*.png"))
if not source_candidates:
    raise FileNotFoundError("No logo image found in public/logo")

source = source_candidates[0]
source_logo = Image.open(source).convert("RGBA")
content_size = int(500 * LOGO_CONTENT_SCALE)
content = ImageOps.fit(source_logo, (content_size, content_size), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
logo = Image.new("RGBA", (500, 500), LOGO_BACKGROUND)
logo.alpha_composite(content, ((500 - content_size) // 2, (500 - content_size) // 2))
logo.save(LOGO_DIR / "damso-logo.png")

legacy_sizes = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

foreground_sizes = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

for folder_name, size in legacy_sizes.items():
    output = ImageOps.fit(logo, (size, size), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    folder = ANDROID_RES / folder_name
    output.save(folder / "ic_launcher.png")
    output.save(folder / "ic_launcher_round.png")

for folder_name, size in foreground_sizes.items():
    output = ImageOps.fit(logo, (size, size), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    output.save(ANDROID_RES / folder_name / "ic_launcher_foreground.png")

print(f"Generated icons from {source.relative_to(ROOT)}")
