from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
LOCKUP = ROOT / "sogrim-logo-lockup.png"
OUTPUT = ROOT / "assets" / "sogrim-logo-intro.mp4"
WIDTH = 960
HEIGHT = 540
FPS = 30
DURATION = 2.8
BACKGROUND = (255, 255, 255)
ACCENT = (39, 166, 164)


def clamp(value, minimum=0.0, maximum=1.0):
    return max(minimum, min(maximum, value))


def smoothstep(value):
    value = clamp(value)
    return value * value * (3 - 2 * value)


def render_frame(lockup, timestamp):
    frame = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    progress = smoothstep((timestamp - 0.08) / 0.72)
    scale = 0.93 + 0.07 * progress
    target_width = round(790 * scale)
    target_height = round(target_width * lockup.height / lockup.width)
    logo = lockup.resize((target_width, target_height), Image.Resampling.LANCZOS)

    alpha = logo.getchannel("A").point(lambda value: round(value * progress))
    logo.putalpha(alpha)
    x = (WIDTH - target_width) // 2
    y = round((HEIGHT - target_height) / 2 - 8 + (1 - progress) * 14)
    frame.paste(logo, (x, y), logo)

    line_progress = smoothstep((timestamp - 0.62) / 0.58)
    if line_progress > 0:
        draw = ImageDraw.Draw(frame)
        half_width = round(68 * line_progress)
        line_y = min(HEIGHT - 50, y + target_height + 18)
        draw.rounded_rectangle(
            (WIDTH // 2 - half_width, line_y, WIDTH // 2 + half_width, line_y + 3),
            radius=2,
            fill=ACCENT,
        )

    return frame


def build():
    lockup = Image.open(LOCKUP).convert("RGBA")
    writer = imageio_ffmpeg.write_frames(
        str(OUTPUT),
        (WIDTH, HEIGHT),
        fps=FPS,
        codec="libx264",
        macro_block_size=2,
        pix_fmt_in="rgb24",
        pix_fmt_out="yuv420p",
        output_params=["-crf", "22", "-preset", "medium", "-movflags", "+faststart"],
    )
    writer.send(None)
    try:
        for index in range(round(DURATION * FPS)):
            timestamp = index / FPS
            writer.send(render_frame(lockup, timestamp).tobytes())
    finally:
        writer.close()


if __name__ == "__main__":
    build()
