"""Regenerate knight SVG from scratch — polygon approach, fine detail."""
import cv2, numpy as np, re

CANVAS = 256
PAD = 8

# Read existing SVG and parse coords to rebuild binary image
svg = open('assets/icons/app-logo.svg').read()
d_match = re.search(r'd="([^"]+)"', svg)
parts = d_match.group(1).split('Z')

# Draw to binary image properly
from PIL import Image, ImageDraw
img = Image.new('L', (CANVAS, CANVAS), 0)
draw = ImageDraw.Draw(img)
for i, p in enumerate(parts):
    coords = re.findall(r'([\d.]+)\s*,\s*([\d.]+)', p)
    if len(coords) < 3: continue
    pts = [(float(x), float(y)) for x, y in coords]
    fill = 255 if i == 0 else 0
    draw.polygon(pts, fill=fill)

img.save('_temp_knight.png')

# Trace with OpenCV
img_cv = cv2.imread('_temp_knight.png', cv2.IMREAD_GRAYSCALE)
contours, hierarchy = cv2.findContours(img_cv, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)

# Collect all white regions (outer) and black holes
outer_pts = None
holes = []

for i, cnt in enumerate(contours):
    area = cv2.contourArea(cnt)
    if area < 10: continue
    # Check if this is a white region (pixel value is 255) or hole (0)
    M = cv2.moments(cnt)
    if M['m00'] == 0: continue
    cx, cy = int(M['m10']/M['m00']), int(M['m01']/M['m00'])
    if 0 <= cx < CANVAS and 0 <= cy < CANVAS:
        pixel = img_cv[cy, cx]
    else:
        pixel = 0
    if pixel > 128:  # white = outer
        if outer_pts is None or area > cv2.contourArea(outer_pts):
            outer_pts = cnt
    else:  # black = hole
        holes.append(cnt)

if outer_pts is None:
    print("No outer contour found!"); exit(1)

# Fine polygon approx
outer = outer_pts.reshape(-1, 2)
eps = 0.0008 * cv2.arcLength(outer_pts, True)
approx = cv2.approxPolyDP(outer_pts, eps, True)
pts = approx.reshape(-1, 2)
path_main = 'M ' + ' L '.join(f'{p[0]:.1f},{p[1]:.1f}' for p in pts) + ' Z'

# Holes
hole_parts = []
for cnt in holes:
    area = cv2.contourArea(cnt)
    if area < 20: continue
    e2 = 0.002 * cv2.arcLength(cnt, True)
    ap = cv2.approxPolyDP(cnt, e2, True)
    pts2 = ap.reshape(-1, 2)
    if len(pts2) >= 4:
        hole_parts.append('M ' + ' L '.join(f'{p[0]:.1f},{p[1]:.1f}' for p in pts2) + ' Z')

all_d = ' '.join([path_main] + hole_parts)
new_svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}">\n  <path d="{all_d}" fill="#000" fill-rule="evenodd"/>\n</svg>'
open('assets/icons/app-logo.svg', 'w').write(new_svg)
print(f'Done: {len(new_svg)} bytes, {len(pts)} outer pts, {len(hole_parts)} holes')
