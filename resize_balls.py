#!/usr/bin/env python3
# /// script
# dependencies = [
#   "pillow>=10.0.0",
# ]
# ///

"""
Resize all ball images to 512x512 while maintaining aspect ratio.
Adds transparent padding to make images square before resizing.
"""

from pathlib import Path
from PIL import Image


def resize_image_to_square(image_path: Path, target_size: int = 512) -> None:
    """
    Resize an image to target_size x target_size, maintaining aspect ratio.
    Adds transparent padding to make the image square first.

    Args:
        image_path: Path to the image file
        target_size: Target size in pixels (default 512)
    """
    print(f"Processing: {image_path}")

    # Open the image
    img = Image.open(image_path)

    # Convert to RGBA if not already (to support transparency)
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    # Get current dimensions
    width, height = img.size
    print(f"  Original size: {width}x{height}")

    # Determine the larger dimension to make the canvas square
    max_dim = max(width, height)

    # Create a new square transparent image
    square_img = Image.new("RGBA", (max_dim, max_dim), (0, 0, 0, 0))

    # Calculate position to paste the original image (centered)
    paste_x = (max_dim - width) // 2
    paste_y = (max_dim - height) // 2

    # Paste the original image onto the square canvas
    square_img.paste(img, (paste_x, paste_y), img)

    # Resize to target size using high-quality resampling
    resized_img = square_img.resize(
        (target_size, target_size), Image.Resampling.LANCZOS
    )

    # Save the image, overwriting the original
    resized_img.save(image_path, "PNG", optimize=True)
    print(f"  Saved as: {target_size}x{target_size}")


def main():
    """Process all PNG images in the balls directory."""
    # Get the script directory and find the balls folder
    script_dir = Path(__file__).parent
    balls_dir = script_dir / "src" / "assets" / "images" / "balls"

    if not balls_dir.exists():
        print(f"Error: Directory not found: {balls_dir}")
        return

    # Find all PNG images recursively
    image_files = list(balls_dir.rglob("*.png"))

    if not image_files:
        print("No PNG images found!")
        return

    print(f"Found {len(image_files)} images to process\n")

    # Process each image
    for image_path in image_files:
        try:
            resize_image_to_square(image_path, target_size=512)
        except Exception as e:
            print(f"  Error processing {image_path}: {e}")
        print()

    print("Done!")


if __name__ == "__main__":
    main()
