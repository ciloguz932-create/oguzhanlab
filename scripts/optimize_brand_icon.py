from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/images/icon.png"
TARGETS = [
    ROOT / "assets/images/icon.png",
    ROOT / "assets/images/splash-icon.png",
    ROOT / "assets/images/favicon.png",
    ROOT / "assets/images/android-icon-foreground.png",
]


def main() -> None:
    with Image.open(SOURCE) as source:
        image = source.convert("RGB")
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        if image.size != (1024, 1024):
            canvas = Image.new("RGB", (1024, 1024), "#10243E")
            x = (1024 - image.width) // 2
            y = (1024 - image.height) // 2
            canvas.paste(image, (x, y))
            image = canvas
        optimized = image.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
        for target in TARGETS:
            optimized.save(target, format="PNG", optimize=True, compress_level=9)
            print(f"optimized {target.name}: {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
