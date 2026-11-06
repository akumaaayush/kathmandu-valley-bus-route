"""Build the trip-planner network: stations, route lines and real-world coordinates.

Outputs src/data/tripNetwork.js with
  STATIONS: [name, x, y, lat, lon, exact]   x/y on the 11667 x 8750 canvas, exact=1 when lat/lon is a
            name-matched OpenStreetMap feature, 0 when interpolated from nearby matched stations
  LINES:    one entry per distinct route geometry in the SVG: its stations, and which stations are adjacent

Pipeline
  1. Stop dots (<circle>, plus terminus dots drawn as <path>) are clustered into stations; dots of parallel
     lines at the same stop form one station. Each station is paired with its nearest stop label.
  2. Each route branch (svgId in dedicatedRoutesData.js, or the operator group when it has no branches) is
     sampled into polylines. A station is on a line when one of its dots sits on the line. Adjacent
     stations are found by walking the line geometry, so branching and looping lines route correctly.
  3. Station names are matched to named OpenStreetMap features (Overpass API, cached) with spatial
     disambiguation: a rough map->geo fit from unambiguous names, then iterative local affine refinement.

Usage: .venv/Scripts/python scripts/build_trip_network.py [--refresh-osm]
Requires: numpy, svgelements
"""
import collections
import heapq
import json
import math
import re
import subprocess
import sys
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
from svgelements import SVG, Shape

ROOT = Path(__file__).resolve().parent.parent
SVG_FILE = ROOT / 'public' / 'Kathmandu_Bus_Route_Map.svg'
OSM_CACHE = ROOT / 'routes_data' / 'osm_named_features.json'
OUT_FILE = ROOT / 'src' / 'data' / 'tripNetwork.js'
SHAPES_FILE = ROOT / 'src' / 'data' / 'lineShapes.js'
SHAPE_TOLERANCE = 0.35  # SVG units (~2.5 canvas px) for simplifying line shapes used in tap hit-testing

# SVG units -> 11667 x 8750 canvas: uniform scale, cropped at top and bottom (canvas = scale * svg + offset).
# Measured by locating 58 SVG stop dots in clean-map.jpg (median error 0.6 px); keep in sync with MapViewer.jsx.
SVG_SCALE_X, SVG_OFFSET_X = 7.36622, -1.19
SVG_SCALE_Y, SVG_OFFSET_Y = 7.36564, -23.53

STATION_CLUSTER_DIST = 3.6  # SVG units: dots of parallel lines at one stop
LABEL_MAX_DIST = 6.0
DOT_ON_LINE_DIST = 0.9
SAMPLE_STEP = 0.5
OSM_BBOX = (27.50, 85.13, 27.87, 85.62)
NS = '{http://www.w3.org/2000/svg}'
ROUTE_CODE_RE = re.compile(r"^[A-Z]\d{1,2}'?(\s*/\s*[A-Z]?\d{1,2})?$")
# Labels without a stop dot that are street names or text fragments, not stops
# Stops whose label the artwork draws too far from their dots for the automatic pairing: label name -> the SVG point
# of the stop's dots, plus route codes that pass the stop without a dot of their own there (snapped onto it).
# Sukedhara: the label sits beside O1/E1, but the stop is the dot row on the ring road between Dhumbarahi and
# Gopikrishna; O1 runs in along the ring road from there and E1 crosses it at the same junction.
STOP_OVERRIDES = {
    'Sukedhara': {'at': (797.2, 425.8), 'also_on': ['O1', 'E1']},
}
NOT_A_STOP_RE =re.compile(r'(\b(road|marga?|sadak|bato|corridor|path|street)$)|^.{1,5}$|^ka municipality$', re.I)


# ---------------------------------------------------------------- 1. Stations ---------------------------------
def load_stations():
    root = ET.parse(SVG_FILE).getroot()
    parent = {c: p for p in root.iter() for c in p}

    def group_of(el):
        while el in parent:
            el = parent[el]
            if el.get('id'):
                return el.get('id')
        return ''

    dots, labels = [], []
    for el in root.iter():
        tag = el.tag.replace(NS, '')
        group = group_of(el)
        if tag == 'circle':
            dots.append((float(el.get('cx')), float(el.get('cy'))))
        elif tag == 'path' and group == 'Final_Stops_with_Symbology' and el.get('class') == 'cls-76':
            # Terminus dot drawn as two arcs starting at the bottom of the circle: "Mx,y a r,r ..."
            m = re.match(r'M([-\d.]+),([-\d.]+)a([\d.]+)', el.get('d', ''))
            if m:
                dots.append((float(m.group(1)), float(m.group(2)) - float(m.group(3))))
        elif tag == 'text' and group in ('Stops_and_Stop_Names', 'Final_Stops_with_Symbology', 'Stop_names_inside_Ring_Road_02'):
            m = re.match(r'translate\(([-\d.]+)[ ,]+([-\d.]+)\)', el.get('transform', ''))
            if not m:
                continue
            lines = collections.OrderedDict()
            cur_y = 0.0

            def add(s, y):
                lines[round(y, 1)] = lines.get(round(y, 1), '') + (s or '')

            add(el.text, 0)
            for ts in el:
                if ts.get('y') is not None:
                    cur_y = float(ts.get('y'))
                add(ts.text, cur_y)
                add(ts.tail, cur_y)
            text_lines = [re.sub(r'\s+', ' ', v).strip() for _, v in sorted(lines.items())]
            text_lines = [t for t in text_lines if t]
            name = ' '.join(text_lines)
            if not name or ROUTE_CODE_RE.match(name):
                continue
            x, y = float(m.group(1)), float(m.group(2))
            width = max(len(t) for t in text_lines) * 1.05
            height = (len(text_lines) - 1) * 2.39
            labels.append({'name': name, 'rect': (x, y - 1.6, x + width, y + height + 0.4)})

    # Cluster dots into stations (union-find)
    pts = np.array(dots)
    parent_idx = list(range(len(pts)))

    def find(i):
        while parent_idx[i] != i:
            parent_idx[i] = parent_idx[parent_idx[i]]
            i = parent_idx[i]
        return i

    for i in range(len(pts)):
        d = np.linalg.norm(pts - pts[i], axis=1)
        for j in np.nonzero(d < STATION_CLUSTER_DIST)[0]:
            a, b = find(i), find(int(j))
            if a != b:
                parent_idx[a] = b
    clusters = collections.defaultdict(list)
    for i in range(len(pts)):
        clusters[find(i)].append(i)
    stations = [{'dots': pts[idx], 'name': None} for idx in clusters.values()]

    # Pair labels and stations one-to-one, closest first
    def rect_dist(p, r):
        dx = max(r[0] - p[0], 0, p[0] - r[2])
        dy = max(r[1] - p[1], 0, p[1] - r[3])
        return math.hypot(dx, dy)

    used_s, used_l = set(), set()
    for name, spec in STOP_OVERRIDES.items():
        li = next((i for i, lb in enumerate(labels) if lb['name'] == name), None)
        si = min(range(len(stations)), key=lambda i: np.linalg.norm(stations[i]['dots'].mean(0) - spec['at']))
        if li is None or np.linalg.norm(stations[si]['dots'].mean(0) - spec['at']) > STATION_CLUSTER_DIST:
            raise SystemExit(f'STOP_OVERRIDES: no label or stop dots for {name!r}; update its position')
        stations[si]['name'] = name
        stations[si]['also_on'] = set(spec.get('also_on', ()))
        used_s.add(si)
        used_l.add(li)

    pairs = []
    for si, st in enumerate(stations):
        for li, lb in enumerate(labels):
            r = lb['rect']
            c = st['dots'].mean(0)
            if abs(c[0] - r[0]) > 60 or abs(c[1] - r[1]) > 30:
                continue
            d = min(rect_dist(p, r) for p in st['dots'])
            if d < LABEL_MAX_DIST:
                pairs.append((d, si, li))
    for d, si, li in sorted(pairs):
        if si in used_s or li in used_l:
            continue
        stations[si]['name'] = labels[li]['name']
        used_s.add(si)
        used_l.add(li)
    print(f'stations: {len(stations)} from {len(dots)} dots; named {len(used_s)} of {len(labels)} labels', file=sys.stderr)

    # Labels without a stop dot (e.g. Ratnapark, drawn inside the central terminal loop): keep them as
    # label-only stations, snapped to the nearest line bundle in build_lines()
    for li, lb in enumerate(labels):
        if li not in used_l and not NOT_A_STOP_RE.search(lb['name']):
            r = lb['rect']
            stations.append({'dots': np.array([[(r[0] + r[2]) / 2, (r[1] + r[3]) / 2]]), 'name': lb['name'], 'label_only': True})
    print(f"label-only stations: {', '.join(st['name'] for st in stations if st.get('label_only'))}", file=sys.stderr)
    return stations


# ---------------------------------------------------------------- 2. Lines -------------------------------------
def load_route_defs():
    """Branches from dedicatedRoutesData.js, operators from legendData.js (via node, so the JS stays the source)."""
    script = (
        "import { DEDICATED_ROUTES_MAP } from './src/data/dedicatedRoutesData.js';"
        "import { BUS_SERVICES } from './src/data/legendData.js';"
        "console.log(JSON.stringify({ branches: DEDICATED_ROUTES_MAP, services: BUS_SERVICES.map(({ code, name, color, routes }) => ({ code, name, color, routes })) }));"
    )
    out = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', check=True)
    return json.loads(out.stdout)


OPERATOR_SVG_IDS = {
    'Sajha Yatayat': 'Sajha_Yatayat', 'Nepal Yatayat': 'Nepal_Yatayat', 'Mahanagar Yatayat': 'Mahanagar_Yatayat',
    'Bhaktapur Buses': 'Bhaktapur_Buses', 'Mayur Yatayat': 'Mayur_Yatayat', 'Kirtipur Yatayat': 'Kirtipur_Yatayat',
    'Chandragiri Yatayat': 'Chandragiri_Yatayat', 'Tarakeshwar Yatayat': 'Tarakeshwor_Yatayat',
    'Budhanilkantha Yatayat': 'Budhanilkantha_Yatayat', 'Digo Yatayat': 'Digo_Yatayat',
    'Balaju Yatayat': 'Balaju_Yatayat_Raniban_', 'Samakhusi Yatayat': 'Samakhusi_Yatayat',
    'Gokarneshwar Yatayat': 'Gokarneshwor_Yatayat', 'Riddhi Siddhi Yatayat': 'Riddhi_Siddhi_Yatayat',
    'Gothatar Yatayat': 'Gothatar_Yatayat_or_Force_Bus', 'Panchpokhari Yatayat': 'Panchpokhari_Yatayat',
    'Samyukta Yatayat': 'Samyukta_Yatayat', 'Basuki Yatayat': 'Basuki_Yatayat', 'Juneli Yatayat': 'Juneli_Yatayat',
    'Bagmati Yatayat': 'Bagmati_Yatayat', 'Dhumrabaraha Yatayat': 'Dhumrabaraha_Yatayat', 'Om Janata Yatayat': 'Om_Janata_Yatayat',
}


def sample_element(svg, element_id):
    el = svg.get_element_by_id(element_id)
    if el is None:
        return None
    shapes = [el] if isinstance(el, Shape) else [e for e in el.select() if isinstance(e, Shape)]
    pieces = []
    for shape in shapes:
        path = shape if hasattr(shape, 'as_subpaths') else None
        if path is None:
            from svgelements import Path as SvgPath
            path = SvgPath(shape)
        for sub in path.as_subpaths():
            sub = type(path)(sub)
            length = sub.length(error=1e-3)
            if not length or length < 0.5:
                continue
            n = max(2, int(length / SAMPLE_STEP) + 1)
            pts = np.array([[p.x, p.y] for p in (sub.point(t) for t in np.linspace(0, 1, n))])
            pieces.append(pts)
    return pieces


def simplify(points, tolerance):
    """Douglas-Peucker polyline simplification."""
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    ab = b - a
    norm = np.linalg.norm(ab)
    if norm == 0:
        d = np.linalg.norm(points - a, axis=1)
    else:
        d = np.abs(ab[0] * (points[:, 1] - a[1]) - ab[1] * (points[:, 0] - a[0])) / norm
    k = int(np.argmax(d))
    if d[k] <= tolerance:
        return np.array([a, b])
    return np.vstack([simplify(points[: k + 1], tolerance)[:-1], simplify(points[k:], tolerance)])


def line_point_graph(pieces):
    """Graph over the sampled points of a line: consecutive samples, plus piece ends joined to nearby pieces."""
    pts = np.vstack(pieces)
    offsets = np.cumsum([0] + [len(p) for p in pieces])
    adj = collections.defaultdict(list)
    for k, p in enumerate(pieces):
        for i in range(len(p) - 1):
            a, b = offsets[k] + i, offsets[k] + i + 1
            w = float(np.linalg.norm(p[i + 1] - p[i]))
            adj[a].append((b, w))
            adj[b].append((a, w))
    # Junctions and overlapping segments: join each piece end to the nearest point on another piece
    for k, p in enumerate(pieces):
        for end in (0, len(p) - 1):
            a = offsets[k] + end
            d = np.linalg.norm(pts - pts[a], axis=1)
            d[offsets[k]:offsets[k + 1]] = np.inf
            b = int(np.argmin(d))
            if d[b] < 2.5:
                adj[a].append((b, float(d[b])))
                adj[b].append((a, float(d[b])))
    return pts, adj


def station_edges(pts, adj, station_nodes):
    """Adjacent stations along the line: from each station, expand the point graph until other stations are hit."""
    owner = {}
    for si, nodes in station_nodes.items():
        for n in nodes:
            owner[n] = si
    edges = {}
    for si, nodes in station_nodes.items():
        dist = {n: 0.0 for n in nodes}
        heap = [(0.0, n) for n in nodes]
        while heap:
            d, u = heapq.heappop(heap)
            if d > dist.get(u, np.inf):
                continue
            other = owner.get(u)
            if other is not None and other != si:
                key = (min(si, other), max(si, other))
                edges[key] = min(edges.get(key, np.inf), d)
                continue  # do not pass through another station
            for v, w in adj[u]:
                if d + w < dist.get(v, np.inf):
                    dist[v] = d + w
                    heapq.heappush(heap, (d + w, v))
    return edges


def build_lines(stations, defs):
    svg = SVG.parse(str(SVG_FILE), reify=True)
    by_svg_id = collections.OrderedDict()
    for service in defs['services']:
        branches = defs['branches'].get(service['name']) or []
        if branches:
            entries = [(b['code'], b['name'], b['svgId']) for b in branches if b.get('svgId')]
        else:
            entries = [(service['routes'][0], f"Route {service['routes'][0]}: {service['name']}", OPERATOR_SVG_IDS.get(service['name']))]
        for code, name, svg_id in entries:
            if not svg_id:
                continue
            if svg_id in by_svg_id:
                by_svg_id[svg_id]['codes'].append(code)
                continue
            by_svg_id[svg_id] = {'codes': [code], 'name': name, 'svgId': svg_id, 'op': service['code'], 'operator': service['name'], 'color': service['color']}

    lines = []
    for line in by_svg_id.values():
        pieces = sample_element(svg, line['svgId'])
        if not pieces:
            print(f"  ! no geometry for {line['svgId']}", file=sys.stderr)
            continue
        line['pts'], line['adj'] = line_point_graph(pieces)
        # Simplified shape on the canvas, flattened [x0, y0, x1, y1, ...] per piece, for tap hit-testing
        line['shape'] = [
            [int(round(v)) for pt in simplify(piece, SHAPE_TOLERANCE)
             for v in (pt[0] * SVG_SCALE_X + SVG_OFFSET_X, pt[1] * SVG_SCALE_Y + SVG_OFFSET_Y)]
            for piece in pieces
        ]
        lines.append(line)

    # Label-only stations join the lines of the nearest bundle (lines within a few units of the closest one)
    label_only = [si for si, st in enumerate(stations) if st.get('label_only')]
    snap = {}
    for si in label_only:
        c = stations[si]['dots'][0]
        dists = [(float(np.min(np.linalg.norm(ln['pts'] - c, axis=1))), k) for k, ln in enumerate(lines)]
        nearest = min(d for d, _ in dists)
        if nearest < LABEL_MAX_DIST * 2:
            snap[si] = {k for d, k in dists if d < nearest + 4.0}

    for k, line in enumerate(lines):
        pts, adj = line.pop('pts'), line.pop('adj')
        station_nodes = {}
        for si, st in enumerate(stations):
            if st.get('label_only'):
                if k in snap.get(si, ()):
                    station_nodes[si] = {int(np.argmin(np.linalg.norm(pts - st['dots'][0], axis=1)))}
                continue
            nodes = set()
            for dot in st['dots']:
                d = np.linalg.norm(pts - dot, axis=1)
                nodes.update(int(n) for n in np.nonzero(d < DOT_ON_LINE_DIST)[0])
            # A line passing the stop without a dot there (STOP_OVERRIDES): its closest point
            if not nodes and st.get('also_on', set()) & set(line['codes']):
                nodes.add(int(np.argmin(np.linalg.norm(pts - st['dots'].mean(0), axis=1))))
            if nodes:
                station_nodes[si] = nodes
        line['edges'] = station_edges(pts, adj, station_nodes)
        line['stations'] = sorted(station_nodes)
        print(f"  {'/'.join(line['codes']):12s} {len(station_nodes):3d} stops {len(line['edges']):3d} links  {line['svgId']}", file=sys.stderr)
    return lines


# ---------------------------------------------------------------- 3. Coordinates -------------------------------
def fetch_osm(refresh):
    if OSM_CACHE.exists() and not refresh:
        return json.loads(OSM_CACHE.read_text(encoding='utf-8'))
    s, w, n, e = OSM_BBOX
    query = f'[out:json][timeout:240];(node["name"]({s},{w},{n},{e});way["name"]["highway"!~"."]({s},{w},{n},{e}););out center tags;'
    req = urllib.request.Request(
        'https://overpass-api.de/api/interpreter',
        data=urllib.parse.urlencode({'data': query}).encode(),
        headers={'User-Agent': 'ktm-bus-map-trip-network/1.0', 'Accept': 'application/json'},
    )
    print('Fetching named features from Overpass API...', file=sys.stderr)
    with urllib.request.urlopen(req, timeout=300) as res:
        data = json.loads(res.read().decode('utf-8'))
    features = []
    for el in data['elements']:
        lat, lon = (el['lat'], el['lon']) if el['type'] == 'node' else (el.get('center', {}).get('lat'), el.get('center', {}).get('lon'))
        if lat is None:
            continue
        t = el.get('tags', {})
        names = [t[k] for k in ('name', 'name:en', 'alt_name', 'old_name', 'official_name', 'short_name') if k in t]
        is_stop = t.get('highway') == 'bus_stop' or 'public_transport' in t
        features.append([round(lat, 7), round(lon, 7), names, 1 if is_stop else 0])
    OSM_CACHE.write_text(json.dumps(features, ensure_ascii=False), encoding='utf-8')
    return features


GENERIC_WORDS = {'bus', 'stop', 'busstop', 'station', 'stn', 'chowk', 'chok', 'marg', 'road', 'rd', 'the', 'park',
                 'buspark', 'gate', 'bridge', 'pul', 'school', 'campus', 'college', 'hospital', 'temple', 'mandir',
                 'of', 'and', 'ko', 'tole', 'tol', 'area', 'stand', 'point', 'near', 'microbus', 'ward', 'office'}


def fold_words(s):
    s = unicodedata.normalize('NFKD', s.lower())
    s = ''.join(c for c in s if not unicodedata.combining(c)).replace('’', '').replace("'", '')
    s = re.sub(r'shw[oa]r|sw[oa]r', 'swr', s)
    out = []
    for w in re.sub(r'[^a-z0-9 ]+', ' ', s).split():
        w = w.replace('ee', 'i').replace('oo', 'u').replace('w', 'v').replace('ph', 'f')
        w = re.sub(r'([bcdgjkpt])h', r'\1', w).replace('sh', 's').replace('aa', 'a')
        w = re.sub(r'(.)\1+', r'\1', w)
        if len(w) > 4:
            w = re.sub(r'[aeiou]$', '', w)
        out.append(w)
    return out


FOLDED_GENERIC = {fold_words(w)[0] for w in GENERIC_WORDS}


def name_keys(name):
    variants = {name}
    m = re.match(r'^(.*?)\((.*?)\)?\s*$', name)
    if m:
        variants.update([m.group(1), m.group(2)])
    variants.update(v for v in re.split(r'\s*[,/]\s*', name) if v)
    keys = set()
    for v in variants:
        words = fold_words(v)
        full = ' '.join(words)
        core = ' '.join(w for w in words if w not in FOLDED_GENERIC)
        if len(full) >= 4:
            keys.add(('full', full))
        if len(core) >= 4:
            keys.add(('core', core))
    return keys


LAT0, LON0 = 27.7, 85.3
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110540


def to_m(lat, lon):
    return np.array([(lon - LON0) * KX, (lat - LAT0) * KY])


def from_m(v):
    return v[1] / KY + LAT0, v[0] / KX + LON0


def fit_affine(src, dst, w=None):
    a = np.hstack([src, np.ones((len(src), 1))])
    if w is not None:
        a, dst = a * w[:, None], dst * w[:, None]
    m, *_ = np.linalg.lstsq(a, dst, rcond=None)
    return m


def predict_local(src, dst, w, p):
    """Weighted local map->metres transform evaluated at p. Affine where the neighbours spread in 2D; a
    similarity transform (rotation, scale, shift) when they are nearly collinear (stops along one radial
    road), where an affine fit would extrapolate wildly sideways."""
    w = w / w.sum()
    src_c = src - w @ src
    cov = (src_c * w[:, None]).T @ src_c
    ev = np.linalg.eigvalsh(cov)
    if ev[0] > 0 and ev[1] / ev[0] < 25:
        return np.append(p, 1) @ fit_affine(src, dst, w)
    # Map y points down, metres y points north: flip before fitting a rotation + scale
    z = src_c[:, 0] - 1j * src_c[:, 1]
    dst_mean = w @ dst
    u = (dst[:, 0] - dst_mean[0]) + 1j * (dst[:, 1] - dst_mean[1])
    a = np.sum(w * np.conj(z) * u) / np.sum(w * np.abs(z) ** 2)
    q = p - w @ src
    r = a * (q[0] - 1j * q[1])
    return dst_mean + np.array([r.real, r.imag])


def geocode(stations, features):
    index = collections.defaultdict(list)
    feat_m = np.array([to_m(f[0], f[1]) for f in features])
    for i, f in enumerate(features):
        for n in f[2]:
            for part in n.split(';'):
                for key in name_keys(part.strip()):
                    index[key].append(i)

    xy = np.array([st['dots'].mean(0) for st in stations])
    cands = []
    for st in stations:
        c = {}
        if st['name']:
            for key in name_keys(st['name']):
                for i in index.get(key, []):
                    c[i] = min(c.get(i, 9), 0 if key[0] == 'full' else 1)
        cands.append(c)

    # Seeds: names whose best candidates form one tight cluster (one place in OSM, e.g. a stop and a town node)
    seeds = {}
    for si, c in enumerate(cands):
        if not c or len(stations[si]['name']) < 5:
            continue
        best = [i for i, q in c.items() if q == min(c.values())]
        p = feat_m[best]
        if np.max(np.linalg.norm(p - p.mean(0), axis=1)) < 800:
            seeds[si] = p.mean(0)

    # Names with one unambiguous OSM location only need a loose spatial check: the schematic distortion
    # (magnified centre, compressed outskirts) can exceed the tight tolerance used to pick between same-named features
    UNAMBIGUOUS_TOL = 2500
    anchors = dict(seeds)

    def predict(p, anchor_ids, exclude=None, k=10):
        # Leave out every station sharing the excluded one's name: repeated labels (the same stop drawn twice)
        # would otherwise vouch for each other's wrong match
        skip = stations[exclude]['name'] if exclude is not None else None
        ids = [a for a in anchor_ids if stations[a]['name'] != skip]
        a_xy = xy[ids]
        a_m = np.array([anchors[a] for a in ids])
        d = np.linalg.norm(a_xy - p, axis=1)
        nn = np.argsort(d)[:k]
        return predict_local(a_xy[nn], a_m[nn], 1 / (d[nn] + 20), p)

    # Reject wrong seeds by local consistency (a single global fit cannot follow the schematic distortion):
    # repeatedly drop the seed its neighbouring seeds disagree with most
    while True:
        ids = list(anchors)
        errs = np.array([np.linalg.norm(predict(xy[a], ids, exclude=a) - anchors[a]) for a in ids])
        if errs.max() <= UNAMBIGUOUS_TOL:
            break
        del anchors[ids[int(np.argmax(errs))]]
    unambiguous = set(anchors)
    print(f'{len(unambiguous)} of {len(seeds)} unambiguous name matches are locally consistent', file=sys.stderr)

    for tol in (2000, 1200, 800, 600, 600):
        ids = list(anchors)
        # Drop anchors that disagree with their neighbours (leave-one-out)
        loo = {a: float(np.linalg.norm(predict(xy[a], ids, exclude=a) - anchors[a])) for a in ids}
        for a in ids:
            if loo[a] > (UNAMBIGUOUS_TOL if a in unambiguous else tol * 1.5):
                del anchors[a]
        ids = list(anchors)
        ids_xy = xy[ids]
        ids_err = np.array([loo[a] for a in ids])
        new = {}
        for si, c in enumerate(cands):
            if not c:
                continue
            pred = predict(xy[si], ids, exclude=si)
            # Tolerance follows how well this part of the map can be predicted (distortion varies a lot)
            near = np.argsort(np.linalg.norm(ids_xy - xy[si], axis=1))[1:7]
            local_tol = max(tol, 2.5 * float(np.median(ids_err[near])))
            scored = sorted(
                (float(np.linalg.norm(feat_m[i] - pred)) + q * 150 - 100 * features[i][3], float(np.linalg.norm(feat_m[i] - pred)), i)
                for i, q in c.items()
            )
            if si in unambiguous and si in anchors:
                new[si] = anchors[si]
            elif scored[0][1] < local_tol:
                new[si] = feat_m[scored[0][2]]
        anchors = new

    ids = list(anchors)
    loo = np.array([np.linalg.norm(predict(xy[a], ids, exclude=a) - anchors[a]) for a in ids])
    print(f'geocoded {len(anchors)} stations from OSM; interpolation error (leave-one-out) median {np.median(loo):.0f} m, '
          f'p90 {np.percentile(loo, 90):.0f} m', file=sys.stderr)

    coords = []
    for si in range(len(stations)):
        if si in anchors:
            coords.append((*from_m(anchors[si]), 1))
        else:
            coords.append((*from_m(predict(xy[si], ids)), 0))
    return coords


# ---------------------------------------------------------------- Output ---------------------------------------
def main():
    refresh = '--refresh-osm' in sys.argv
    stations = load_stations()
    defs = load_route_defs()
    lines = build_lines(stations, defs)

    # Keep named stations that lie on at least one line. Unnamed dots are bridged: their links are merged
    # so routes stay connected through them.
    named = {si for ln in lines for si in ln['stations'] if stations[si]['name']}
    kept_ids = sorted(named)
    remap = {si: k for k, si in enumerate(kept_ids)}
    kept = [stations[si] for si in kept_ids]
    coords = geocode(kept, fetch_osm(refresh))

    out_stations = []
    for st, (lat, lon, exact) in zip(kept, coords):
        cx, cy = st['dots'].mean(0)
        out_stations.append([st['name'], round(cx * SVG_SCALE_X + SVG_OFFSET_X, 1), round(cy * SVG_SCALE_Y + SVG_OFFSET_Y, 1),
                             round(lat, 6), round(lon, 6), exact])
    out_lines = []
    for ln in lines:
        nbrs = collections.defaultdict(dict)
        for (a, b), d in ln['edges'].items():
            nbrs[a][b] = min(nbrs[a].get(b, np.inf), d)
            nbrs[b][a] = min(nbrs[b].get(a, np.inf), d)
        # Bridge unnamed stations: connect their neighbours directly
        for u in [u for u in list(nbrs) if u not in remap]:
            around = list(nbrs[u].items())
            for i, (a, da) in enumerate(around):
                for b, db in around[i + 1:]:
                    nbrs[a][b] = min(nbrs[a].get(b, np.inf), da + db)
                    nbrs[b][a] = min(nbrs[b].get(a, np.inf), da + db)
            for a, _ in around:
                nbrs[a].pop(u, None)
            del nbrs[u]
        edges = sorted({(remap[a], remap[b]) for a in nbrs for b in nbrs[a] if a < b and a in remap and b in remap})
        out_lines.append({
            'codes': ln['codes'], 'name': ln['name'], 'op': ln['op'], 'operator': ln['operator'], 'color': ln['color'],
            'svgId': ln['svgId'], 'stations': sorted(remap[s] for s in ln['stations'] if s in remap),
            'edges': [list(e) for e in edges],
        })

    header = (
        '/**\n'
        ' * Trip-planner network generated by scripts/build_trip_network.py. Do not edit by hand.\n'
        ' * STATIONS: [name, x, y, lat, lon, exact] (x/y on the 11667 x 8750 canvas; exact=1: OpenStreetMap match,\n'
        ' *           0: interpolated from nearby matched stations).\n'
        ' * LINES: route geometries with station indexes ordered along the line and their distance along it (pos).\n'
        ' * Station coordinates © OpenStreetMap contributors (ODbL).\n'
        ' */\n'
    )
    js = header + 'export const STATIONS = ' + json.dumps(out_stations, ensure_ascii=False) + ';\n\n'
    js += 'export const LINES = ' + json.dumps(out_lines, ensure_ascii=False, indent=1) + ';\n'
    OUT_FILE.write_text(js, encoding='utf-8')

    shapes = {ln['svgId']: ln['shape'] for ln in lines}
    shapes_js = (
        '/**\n'
        ' * Simplified route shapes on the 11667 x 8750 canvas, generated by scripts/build_trip_network.py. Do not edit.\n'
        ' * svgId -> pieces, each a flat [x0, y0, x1, y1, ...] polyline. Used to find the lines under a tap.\n'
        ' */\n'
        'export const LINE_SHAPES = ' + json.dumps(shapes, separators=(',', ':')) + ';\n'
    )
    SHAPES_FILE.write_text(shapes_js, encoding='utf-8')
    n_points = sum(len(piece) // 2 for sh in shapes.values() for piece in sh)
    print(f'Wrote {SHAPES_FILE.relative_to(ROOT)}: {n_points} points, {len(shapes_js) / 1024:.0f} KB', file=sys.stderr)
    exact = sum(s[5] for s in out_stations)
    print(f'Wrote {OUT_FILE.relative_to(ROOT)}: {len(out_stations)} stations ({exact} OSM-matched), {len(out_lines)} lines', file=sys.stderr)


if __name__ == '__main__':
    main()
