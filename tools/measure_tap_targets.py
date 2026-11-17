"""Measure the tappable controls on the phone's current screen and list any smaller than 44 x 44 dp.

Usage:  python tools/measure_tap_targets.py <adb-path> <device-serial>
Open the screen to check first (library, editor, a tray tab...). Run once per screen. Exit code 1 if anything is too small.
The browser accessibility tree gives each control's on-screen bounds, so this measures what a finger actually hits.
"""
import os, re, subprocess, sys, tempfile

adb, serial = sys.argv[1], sys.argv[2]
env = dict(os.environ, MSYS_NO_PATHCONV="1")
run = lambda *a: subprocess.run([adb, "-s", serial, *a], capture_output=True, text=True, env=env).stdout.strip()

run("shell", "uiautomator", "dump", "/sdcard/ui.xml")
local = os.path.join(tempfile.gettempdir(), "gs-ui.xml")
run("pull", "/sdcard/ui.xml", local)
density = int(re.search(r"(\d+)", run("shell", "wm", "density").splitlines()[-1]).group(1))
dp = density / 160
screen = re.search(r"(\d+)x(\d+)", run("shell", "wm", "size").splitlines()[-1])
sw, sh = int(screen.group(1)), int(screen.group(2))

small = []
total = 0
for node in re.findall(r"<node[^>]*>", open(local, encoding="utf-8").read()):
    if 'clickable="true"' not in node:
        continue
    x0, y0, x1, y1 = map(int, re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node).groups())
    if x1 <= x0 or y1 <= y0 or x0 >= sw or y0 >= sh:  # scrolled out of view
        continue
    if 'class="android.widget.CheckBox"' in node:  # its label (44 dp tall) is the real target
        continue
    total += 1
    w, h = (x1 - x0) / dp, (y1 - y0) / dp
    name = re.search(r'text="([^"]*)"', node).group(1) or re.search(r'content-desc="([^"]*)"', node).group(1) or "(unnamed)"
    if w < 44 or h < 44:
        small.append(f"{name}: {w:.0f} x {h:.0f} dp")

print(f"{total} tappable controls on screen, {len(small)} smaller than 44 x 44 dp")
for s in small:
    print("  ", s)
sys.exit(1 if small else 0)
