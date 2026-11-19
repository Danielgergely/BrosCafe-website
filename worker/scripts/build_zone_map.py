"""Builds the Delivery zone map from OpenStreetMap (run by hand when the zone or the streets change).

  python3 -m venv /tmp/zv && /tmp/zv/bin/pip install shapely pyproj mapbox-vector-tile
  /tmp/zv/bin/python worker/scripts/build_zone_map.py [radius_m]

Writes site/delivery/map/zone.json (buildings, water, parks, streets, landmarks for the 3D map) and
worker/src/services/zone_area.ts (the zone outline the address check uses). A city block bounded by streets is in
the zone when at least half of its buildings' floor area lies within the radius, so no building or block is cut.
Data © OpenStreetMap contributors (ODbL); water from OpenFreeMap tiles (OSM data).
"""
import json, math, os, sys, time, urllib.parse, urllib.request
from shapely.geometry import LineString, Point, Polygon, box, mapping, shape
from shapely.ops import polygonize, unary_union
from shapely import STRtree, transform as stransform
from pyproj import Transformer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CAFE = (19.0583, 47.51605)  # Csanády u. 4/b, the same point as worker/src/services/zone.ts
R = int(sys.argv[1]) if len(sys.argv) > 1 else 700
AROUND = 1150  # buildings drawn (grey beyond the zone)
BBOX = (19.030, 47.497, 19.085, 47.534)  # w, s, e, n: streets and water
UA = {'User-Agent': 'bros-zone-map/1.0'}
LANDMARKS = [  # label, OSM name of the building or park it sits on
    ('Lehel Piac', 'Lehel Csarnok'), ('Westend', 'Westend'), ('Nyugati pályaudvar', 'Nyugati pályaudvar'),
    ('Vígszínház', 'Vígszínház'), ('Skála', 'Skála Metro áruház'), ('Olimpia park', 'Olimpia park'),
]
LABELS = [('Duna', 19.0462, 47.5085), ('Margitsziget', 19.0462, 47.5230), ('Váci út', 19.0632, 47.5228), ('Szent István krt.', 19.0525, 47.5118)]
STREETS = '^(primary|secondary|tertiary|residential|unclassified|living_street|pedestrian)$'

to_m = Transformer.from_crs(4326, 23700, always_xy=True).transform  # EOV, metres
cx, cy = to_m(*CAFE)


def overpass(q):
    cache = os.environ.get('ZONE_CACHE')  # a folder: reruns reuse the downloads instead of asking the busy public server again
    key = cache and os.path.join(cache, f'{abs(hash(q)) % 10**12}.json')
    if key and os.path.exists(key):
        return json.load(open(key))
    els = _overpass(q)
    if key:
        os.makedirs(cache, exist_ok=True); json.dump(els, open(key, 'w'))
    return els


def _overpass(q):
    for wait in (0, 15, 30, 60):
        time.sleep(wait)
        try:
            req = urllib.request.Request('https://overpass-api.de/api/interpreter', data=urllib.parse.urlencode({'data': q}).encode(), headers=UA)
            return json.loads(urllib.request.urlopen(req, timeout=120).read())['elements']
        except Exception as e:  # the public server answers 429/504 when busy
            print('overpass retry:', e)
    raise SystemExit('Overpass unavailable')


def water():
    tj = json.loads(urllib.request.urlopen(urllib.request.Request('https://tiles.openfreemap.org/planet', headers=UA)).read())
    url, z = tj['tiles'][0], 14
    import mapbox_vector_tile as mvt
    n = 2 ** z
    tx = lambda lon: int((lon + 180) / 360 * n)
    ty = lambda lat: int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    polys = []
    for x in range(tx(BBOX[0]), tx(BBOX[2]) + 1):
        for y in range(ty(BBOX[3]), ty(BBOX[1]) + 1):
            t = mvt.decode(urllib.request.urlopen(urllib.request.Request(url.format(z=z, x=x, y=y), headers=UA)).read())
            if 'water' not in t:
                continue
            ext = t['water']['extent']

            def ll(c, x=x, y=y, ext=ext):  # tile pixels (origin bottom left) -> lon/lat
                lon = (x + c[:, 0] / ext) / n * 360 - 180
                lat = [math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1 - v / ext) / n)))) for v in c[:, 1]]
                c[:, 0], c[:, 1] = lon, lat
                return c
            for f in t['water']['features']:
                polys.append(stransform(shape(f['geometry']), ll).buffer(0))
    return unary_union(polys).intersection(box(*BBOX))


def poly_of(el):
    pts = [(p['lon'], p['lat']) for p in el.get('geometry') or [] if p]  # clipped to the bbox: points outside are null
    if el['type'] == 'way':
        return Polygon(pts).buffer(0) if len(pts) >= 4 else None
    if el['type'] == 'relation':  # multipolygon buildings: outers minus inners
        rings = lambda role: [m['geometry'] for m in el.get('members', []) if m.get('role') == role and m.get('geometry')]
        outer = list(polygonize([LineString([(p['lon'], p['lat']) for p in g]) for g in rings('outer')]))
        inner = list(polygonize([LineString([(p['lon'], p['lat']) for p in g]) for g in rings('inner')]))
        if outer:
            return unary_union(outer).difference(unary_union(inner)) if inner else unary_union(outer)
    return None


def height(t):
    try:
        return round(float(str(t.get('height', '')).replace('m', '').strip()), 1)
    except ValueError:
        pass
    try:
        return round(float(t['building:levels']) * 3.3 + 2, 1)
    except (KeyError, ValueError):
        return 16.0  # a typical five-storey Budapest block


def metres(g):
    return stransform(g, lambda c: __import__('numpy').column_stack(to_m(c[:, 0], c[:, 1])))


def rounded(g, nd=6):
    return json.loads(json.dumps(mapping(g)), parse_float=lambda v: round(float(v), nd))


print('downloading…')
bel = overpass(f'[out:json][timeout:120];(way["building"](around:{AROUND},{CAFE[1]},{CAFE[0]});relation["building"](around:{AROUND},{CAFE[1]},{CAFE[0]}););out geom;')
adr = overpass(f'[out:json][timeout:120];node["addr:housenumber"]["addr:street"](around:{AROUND},{CAFE[1]},{CAFE[0]});out;')
s, w, n_, e = BBOX[1], BBOX[0], BBOX[3], BBOX[2]
base = overpass(f'[out:json][timeout:120][bbox:{s},{w},{n_},{e}];(way["highway"~"{STREETS}"];way["leisure"="park"];);out tags geom({s},{w},{n_},{e});')
rail = overpass(f'[out:json][timeout:120][bbox:{s},{w},{n_},{e}];way["railway"="rail"];out geom({s},{w},{n_},{e});')
wat = water()

streets = [x for x in base if 'highway' in x['tags']]
parks = [(x['tags'].get('name'), poly_of(x)) for x in base if x['tags'].get('leisure') == 'park']
parks = [(nm, p) for nm, p in parks if p is not None and not p.is_empty]
pts_of = lambda x: [(p['lon'], p['lat']) for p in x.get('geometry') or [] if p]
streets = [x for x in streets if len(pts_of(x)) > 1]
lines = [LineString(pts_of(x)) for x in streets]
blocks = [b.difference(wat) for b in polygonize(unary_union(lines + [box(*BBOX).exterior]))]
blocks = [b for b in blocks if not b.is_empty]
tree = STRtree(blocks)

buildings = []
for el in bel:
    g = poly_of(el)
    if g is None or g.is_empty or g.area == 0:
        continue
    t = el.get('tags', {})
    a = f"{t['addr:street']} {t['addr:housenumber']}" if 'addr:street' in t and 'addr:housenumber' in t else None
    buildings.append({'g': g, 'gm': metres(g), 'h': height(t), 'a': a, 'n': t.get('name'), 'b': None})
btree = STRtree([b['g'] for b in buildings])
for x in adr:  # house numbers mapped as entrance points
    p = Point(x['lon'], x['lat'])
    for i in btree.query(p, predicate='within'):
        if not buildings[i]['a']:
            buildings[i]['a'] = f"{x['tags']['addr:street']} {x['tags']['addr:housenumber']}"

circle = Point(cx, cy).buffer(R, 128)
for b in buildings:
    hits = tree.query(b['g'].representative_point(), predicate='within')
    b['b'] = int(hits[0]) if len(hits) else None
# the railway out of Nyugati is a barrier: nothing whose way from the café crosses a track (Daniel 2026-11-19)
tracks = unary_union([LineString(pts_of(x)) for x in rail if len(pts_of(x)) > 1 and x['tags'].get('tunnel') != 'building_passage'])  # not the platforms inside the station hall
across_rail = lambda p: LineString([CAFE, (p.x, p.y)]).intersects(tracks)
inside_blocks = set()
for bi in {b['b'] for b in buildings if b['b'] is not None}:
    mine = [b for b in buildings if b['b'] == bi]
    area = sum(b['gm'].area for b in mine)
    near = sum(b['gm'].intersection(circle).area for b in mine if not across_rail(b['g'].representative_point()))
    if area and near / area >= 0.5:
        inside_blocks.add(bi)
for b in buildings:
    b['z'] = 1 if (b['b'] in inside_blocks if b['b'] is not None else b['gm'].representative_point().within(circle) and not across_rail(b['g'].representative_point())) else 0

# the zone outline: whole blocks, plus the few buildings outside any block; 6 m beyond the facades for entrances
zone = unary_union([blocks[i] for i in inside_blocks] + [b['g'] for b in buildings if b['z'] and b['b'] is None])
zone_m = metres(zone).buffer(6).simplify(2)
to_ll = Transformer.from_crs(23700, 4326, always_xy=True).transform
zone = stransform(zone_m, lambda c: __import__('numpy').column_stack(to_ll(c[:, 0], c[:, 1])))

by_name = {b['n']: b for b in buildings if b['n']}
marks = []
for label, name in LANDMARKS:
    if name in by_name:
        b = by_name[name]; p = b['g'].representative_point(); marks.append({'label': label, 'lon': round(p.x, 6), 'lat': round(p.y, 6), 'z': b['z']})
    else:
        pk = next((p for nm, p in parks if nm == name), None)
        if pk is not None:
            p = pk.representative_point(); marks.append({'label': label, 'lon': round(p.x, 6), 'lat': round(p.y, 6), 'z': int(p.within(zone))})

feat = lambda g, props: {'type': 'Feature', 'geometry': rounded(g), 'properties': props}
out = {
    'cafe': list(CAFE), 'radius_m': R, 'built': time.strftime('%Y-%m-%d'),
    'buildings': {'type': 'FeatureCollection', 'features': [feat(b['g'], {k: v for k, v in (('h', b['h']), ('z', b['z']), ('a', b['a']), ('n', b['n'])) if v is not None}) for b in buildings]},
    'water': {'type': 'FeatureCollection', 'features': [feat(wat.simplify(0.00002), {})]},
    'parks': {'type': 'FeatureCollection', 'features': [feat(p.simplify(0.00001), {}) for _, p in parks]},
    'streets': {'type': 'FeatureCollection', 'features': [feat(l.simplify(0.00001), {'k': 1 if x['tags']['highway'] in ('primary', 'secondary') else 0}) for x, l in zip(streets, lines)]},
    'zone': {'type': 'FeatureCollection', 'features': [feat(zone.simplify(0.00001), {})]},
    'landmarks': marks, 'labels': [{'label': l, 'lon': x, 'lat': y} for l, x, y in LABELS],
}
os.makedirs(os.path.join(ROOT, 'site/delivery/map'), exist_ok=True)
with open(os.path.join(ROOT, 'site/delivery/map/zone.json'), 'w') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
polys = [zone] if zone.geom_type == 'Polygon' else list(zone.geoms)
ts = [[[[round(x, 6), round(y, 6)] for x, y in p.exterior.coords]] + [[[round(x, 6), round(y, 6)] for x, y in r.coords] for r in p.interiors] for p in polys]
with open(os.path.join(ROOT, 'worker/src/services/zone_area.ts'), 'w') as f:
    f.write(f'// GENERATED by worker/scripts/build_zone_map.py ({out["built"]}, {R} m, whole street blocks). Do not edit by hand.\n'
            '// Polygons as [outer ring, ...holes], each ring [[lon, lat], ...]. Data © OpenStreetMap contributors.\n'
            f'export const ZONE_AREA: number[][][][] = {json.dumps(ts, separators=(",", ":"))};\n')
print(f"{len(buildings)} buildings, {sum(b['z'] for b in buildings)} in the zone, {sum(1 for b in buildings if b['a'])} with an address; "
      f"{len(inside_blocks)} blocks; landmarks {[(m['label'], m['z']) for m in marks]}")
