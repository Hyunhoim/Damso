from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


src = Path(r"D:\Damso\tmp\pdfs\rdplan")
out = Path(r"D:\Damso\tmp\pdfs\rdplan")
files = sorted(src.glob("rdplan-*.png"), key=lambda p: int(p.stem.split("-")[-1]))

thumb_w = 240
label_h = 28
margin = 12
gap = 12
cols = 5
rows = 4
per_sheet = cols * rows

try:
    font = ImageFont.truetype("arial.ttf", 16)
except Exception:
    font = ImageFont.load_default()

for sheet_idx in range((len(files) + per_sheet - 1) // per_sheet):
    batch = files[sheet_idx * per_sheet:(sheet_idx + 1) * per_sheet]
    thumbs = []
    for path in batch:
        im = Image.open(path).convert("RGB")
        ratio = thumb_w / im.width
        thumb_h = int(im.height * ratio)
        im = im.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        thumbs.append((path, im))
    max_h = max(im.height for _, im in thumbs)
    sheet_w = margin * 2 + cols * thumb_w + (cols - 1) * gap
    sheet_h = margin * 2 + rows * (max_h + label_h) + (rows - 1) * gap
    sheet = Image.new("RGB", (sheet_w, sheet_h), "white")
    draw = ImageDraw.Draw(sheet)
    for idx, (path, im) in enumerate(thumbs):
        r, c = divmod(idx, cols)
        x = margin + c * (thumb_w + gap)
        y = margin + r * (max_h + label_h + gap)
        page = int(path.stem.split("-")[-1])
        draw.text((x, y), f"Page {page}", fill="black", font=font)
        sheet.paste(im, (x, y + label_h))
    sheet.save(out / f"contact_sheet_{sheet_idx + 1:02d}.png")

print(f"made {(len(files) + per_sheet - 1) // per_sheet} sheets")
