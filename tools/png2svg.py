"""PNG → SVG: greedy geometric primitive fitting (arc/line)."""
import cv2, numpy as np, glob, math, os

PNG = sorted(glob.glob('Snipaste*.png'))[0] if glob.glob('Snipaste*.png') else sorted(glob.glob('Snipaste*_backup.png'))[0]
OUT = 'assets/icons/app-logo.svg'
CANVAS = 1024
LINE_TOL = 5.0; ARC_TOL = 3.0  # tolerance in pixels

# ---- 1. K-means quantize ----
img = cv2.imread(PNG)
h, w = img.shape[:2]
pixels = img.reshape(-1, 3).astype(np.float32)
K = 5
_, labels, centers = cv2.kmeans(pixels, K, None,
    (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.1), 10, cv2.KMEANS_RANDOM_CENTERS)
centers = centers.astype(np.uint8)
counts = np.bincount(labels.flatten())
order = np.argsort(-counts)
bg_idx = order[0]; fg_indices = order[1:]

scale = CANVAS / max(w, h)
nw, nh = int(w * scale), int(h * scale)
ox, oy = (CANVAS - nw)//2, (CANVAS - nh)//2

# ---- 2. Circle from 3 points ----
def circle_3pt(a, b, c):
    d = 2*(a[0]*(b[1]-c[1]) + b[0]*(c[1]-a[1]) + c[0]*(a[1]-b[1]))
    if abs(d) < 1e-9: return None
    ux = ((a[0]**2+a[1]**2)*(b[1]-c[1]) + (b[0]**2+b[1]**2)*(c[1]-a[1]) + (c[0]**2+c[1]**2)*(a[1]-b[1]))/d
    uy = ((a[0]**2+a[1]**2)*(c[0]-b[0]) + (b[0]**2+b[1]**2)*(a[0]-c[0]) + (c[0]**2+c[1]**2)*(b[0]-a[0]))/d
    r = math.hypot(ux-a[0], uy-a[1])
    return (ux, uy, r) if 5 < r < CANVAS*3 else None

# ---- 3. RANSAC segment fitting on contour point cloud ----
def fit_contour_rsc(pts):
    """RANSAC: iteratively find largest line or arc, remove inliers, repeat."""
    n = len(pts)
    if n < 12: return []
    remaining = np.ones(n, dtype=bool)
    prims = []
    max_iter = 300

    while np.sum(remaining) > 12:
        idx = np.where(remaining)[0]
        sub = pts[idx]
        best = None  # (type, params, inlier_mask_on_sub)
        best_count = 0

        # RANSAC for LINE
        for _ in range(min(max_iter, len(idx)*2)):
            if len(idx) < 2: break
            i, j = np.random.choice(len(idx), 2, replace=False)
            p1, p2 = sub[i], sub[j]
            vec = p2 - p1; length = np.linalg.norm(vec)
            if length < 5: continue
            dists = np.array([abs(np.linalg.norm(np.cross(vec, sub[k]-p1)))/length for k in range(len(idx))])
            inl = dists < 5.0
            cnt = np.sum(inl)
            if cnt > best_count and cnt >= 5:
                best_count = cnt; best = ('line', (p1, p2), inl)

        # RANSAC for ARC — only contiguous inliers
        for _ in range(min(max_iter, len(idx)*2)):
            if len(idx) < 3: break
            a_idx, b_idx, c_idx = np.random.choice(len(idx), 3, replace=False)
            cr = circle_3pt(sub[a_idx], sub[b_idx], sub[c_idx])
            if cr is None: continue
            cx, cy, r = cr
            dists = np.abs(np.sqrt((sub[:,0]-cx)**2+(sub[:,1]-cy)**2)-r)
            inl = dists < 2.5  # tighter tolerance
            # Only count the LONGEST contiguous inlier segment
            max_contig = 0; cur = 0
            for v in inl:
                if v: cur += 1; max_contig = max(max_contig, cur)
                else: cur = 0
            if max_contig > best_count and max_contig >= 12:
                best_count = max_contig; best = ('arc', (cx, cy, r), inl)

        if best is None: break

        typ, params, inl = best
        # Map inlier indices back to full pts
        inl_full = np.zeros(n, dtype=bool)
        inl_full[idx[inl]] = True

        # Find start and end of the inlier segment along contour
        inl_indices = np.where(inl_full)[0]
        if len(inl_indices) < 4: break

        start_idx = inl_indices[0]
        end_idx = inl_indices[-1]
        seg_pts = pts[start_idx:end_idx+1]

        prims.append((typ, params, start_idx, end_idx))
        remaining[start_idx:end_idx+1] = False

    # DEBUG
    rem_count = np.sum(remaining)
    if rem_count > 0:
        print(f'    remaining: {rem_count} pts')
        groups_found = 0
        in_group = False
        for i in range(n):
            if remaining[i]:
                if not in_group: in_group = True
            elif in_group: groups_found += 1; in_group = False
        print(f'    groups: {groups_found}')
    # Collect remaining contiguous segments as lines
    if np.sum(remaining) >= 4:
        groups = []
        in_group = False; g_start = 0
        for i in range(n):
            if remaining[i]:
                if not in_group: g_start = i; in_group = True
            else:
                if in_group and i - g_start >= 3:
                    groups.append((g_start, i-1))
                in_group = False
        if in_group and n - g_start >= 3: groups.append((g_start, n-1))
        # Wrap-around group
        if remaining[0] and remaining[-1] and len(groups) >= 2:
            last_end = groups[-1][1]
            first_start = groups[0][0]
            groups = groups[1:-1] + [(first_start, last_end)]
        for gs, ge in groups:
            prims.append(('line', (pts[gs], pts[ge]), gs, ge))

    prims.sort(key=lambda x: x[2])
    return prims

def primitives_to_path(pts, prims):
    if not prims: return ''
    # Use first primitive's start point
    start_pt = pts[prims[0][2]]
    d = [f'M {start_pt[0]:.1f},{start_pt[1]:.1f}']

    # Order primitives by start index
    ordered = sorted(prims, key=lambda x: x[2])
    for typ, params, start_idx, end_idx in ordered:
        start_pt = pts[start_idx]
        end_pt = pts[end_idx]
        if typ == 'arc':
            cx, cy, r = params
            v1 = start_pt - np.array([cx, cy])
            v2 = end_pt - np.array([cx, cy])
            sw = 1 if v1[0]*v2[1] - v1[1]*v2[0] >= 0 else 0
            d.append(f'A {r:.1f} {r:.1f} 0 0 {sw} {end_pt[0]:.1f} {end_pt[1]:.1f}')
        else:
            d.append(f'L {end_pt[0]:.1f} {end_pt[1]:.1f}')
    d.append('Z')
    return ' '.join(d)

# ---- 4. Build SVG ----
paths = []
for idx in fg_indices:
    c = centers[idx]; hx = f'#{c[2]:02x}{c[1]:02x}{c[0]:02x}'
    mask = (labels.flatten() == idx).reshape(h, w).astype(np.uint8)*255
    mask_r = cv2.resize(mask, (nw, nh), interpolation=cv2.INTER_NEAREST)
    canvas = np.zeros((CANVAS, CANVAS), dtype=np.uint8)
    canvas[oy:oy+nh, ox:ox+nw] = mask_r
    contours, _ = cv2.findContours(canvas, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_TC89_L1)
    for cnt in contours:
        if cv2.contourArea(cnt) < 50: continue
        pts = cnt.reshape(-1, 2).astype(float)
        prims = fit_contour_rsc(pts)
        na = sum(1 for p in prims if p[0]=='arc')
        nl = sum(1 for p in prims if p[0]=='line')
        print(f'  shape: {len(pts)} pts → {na} arcs + {nl} lines')
        pd = primitives_to_path(pts, prims)
        if pd:
            paths.append(f'<path d="{pd}" fill="{hx}" fill-rule="evenodd"/>')

bg_hex = f'#{centers[bg_idx][2]:02x}{centers[bg_idx][1]:02x}{centers[bg_idx][0]:02x}'
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}">\n  <rect width="{CANVAS}" height="{CANVAS}" fill="{bg_hex}"/>\n'+'\n  '.join(paths)+'\n</svg>'
open(OUT, 'w').write(svg)
ta = svg.count(' A '); tl = sum(p.count(' L ') for p in paths)
print(f'\n{OUT}: {len(svg)} bytes, {len(paths)} shapes, {ta} arcs, ~{tl} lines')
os.rename(PNG, PNG.replace('.png', '_backup.png'))
