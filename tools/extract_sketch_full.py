"""Complete Sketch asset extractor — outputs structured design catalog JSON"""
import zipfile, json, sys, os

def extract_color(layer_style):
    """Extract color info from a sketch style object"""
    fills = layer_style.get('fills', [])
    colors = []
    for f in fills:
        if not f.get('isEnabled', True): continue
        c = f.get('color', {})
        if not c: continue
        r = round(c['red']*255); g = round(c['green']*255); b = round(c['blue']*255); a = round(c.get('alpha',1), 2)
        colors.append({
            'hex': f'#{r:02x}{g:02x}{b:02x}',
            'css': f'rgba({r},{g},{b},{a})' if a < 1 else f'#{r:02x}{g:02x}{b:02x}',
            'alpha': a
        })
    return colors

def extract_borders(layer_style):
    borders = layer_style.get('borders', [])
    if not isinstance(borders, list): return []
    result = []
    for b in borders:
        if not isinstance(b, dict): continue
        if not b.get('isEnabled', True): continue
        c = b.get('color', {})
        if not c: continue
        r = round(c['red']*255); g=round(c['green']*255); b=round(c['blue']*255)
        result.append({'color': f'#{r:02x}{g:02x}{b:02x}', 'width': b.get('thickness', 1), 'position': b.get('position', 'center')})
    return result

def extract_text(layer):
    """Extract text properties"""
    style = layer.get('style', {})
    text_style = style.get('textStyle', {})
    return {
        'content': layer.get('attributedString', {}).get('string', ''),
        'font': {
            'family': text_style.get('encodedAttributes', {}).get('MSAttributedStringFontAttribute', {}).get('_attributes', {}).get('name', 'SF Pro'),
            'size': text_style.get('encodedAttributes', {}).get('MSAttributedStringFontAttribute', {}).get('_attributes', {}).get('size', 17),
        },
        'color': extract_color(style),
        'alignment': layer.get('textBehaviour', 0),
        'lineHeight': layer.get('lineHeight', None)
    }

def extract_layer(layer, depth=0):
    """Recursively extract a single layer with all properties"""
    cls = layer.get('_class', 'unknown')
    name = layer.get('name', '?')
    frame = layer.get('frame', {})
    
    info = {
        'name': name,
        'class': cls,
        'frame': {
            'x': frame.get('x', 0), 'y': frame.get('y', 0),
            'w': frame.get('width', 0), 'h': frame.get('height', 0)
        },
    }
    
    style = layer.get('style', {})
    
    # Fills
    fills = extract_color(style)
    if fills: info['fills'] = fills
    
    # Borders (skip if not a proper list of dicts)
    try:
        borders = extract_borders(style)
        if borders: info['borders'] = borders
    except: pass
    
    # Text
    if cls == 'text':
        info['text'] = extract_text(layer)
    
    # Corners (for rectangles)
    if layer.get('points'):
        pts = layer['points']
        if len(pts) == 4:
            cr = pts[0].get('cornerRadius', 0)
            if cr > 0: info['cornerRadius'] = cr
    
    # Shadow
    shadows = style.get('shadows', [])
    if shadows:
        s = shadows[0]
        if s.get('isEnabled', True):
            info['shadow'] = {
                'offsetX': s.get('offsetX', 0),
                'offsetY': s.get('offsetY', 0),
                'blur': s.get('blurRadius', 0),
                'spread': s.get('spread', 0),
                'color': extract_color({'_class':'style','fills':[{'color':s.get('color',{})}]})
            }
    
    # Opacity
    if style.get('contextSettings', {}).get('opacity', 1) < 1:
        info['opacity'] = style['contextSettings']['opacity']
    
    # Children
    children = layer.get('layers', [])
    if children:
        info['children'] = [extract_layer(c, depth+1) for c in children]
    
    return info

def main(p):
    path = p if p else 'Apple iOS 27 UI Kit.sketch'
    out_name = path.replace('.sketch','') + '_catalog.json'
    
    print(f'Extracting: {path}')
    catalog = {'swatches': [], 'symbols': []}
    
    with zipfile.ZipFile(path) as z:
        doc = json.loads(z.read('document.json'))
        zip_files = set(z.namelist())
        
        # 1. Swatches (colors)
        swatches = doc.get('sharedSwatches', {}).get('objects', [])
        for s in swatches:
            v = s.get('value', {})
            if v.get('_class') == 'color':
                r = round(v['red']*255); g = round(v['green']*255); b = round(v['blue']*255)
                a = round(v.get('alpha',1), 2)
                catalog['swatches'].append({
                    'name': s['name'],
                    'hex': f'#{r:02x}{g:02x}{b:02x}',
                    'css': f'rgba({r},{g},{b},{a})' if a < 1 else f'#{r:02x}{g:02x}{b:02x}'
                })
        print(f'  Swatches: {len(catalog["swatches"])}')
        
        # 2. Symbols from pages
        for pr in doc['pages']:
            fname = pr['_ref'] + '.json'
            if fname not in zip_files: continue
            pg = json.loads(z.read(fname))
            for layer in pg.get('layers', []):
                if layer.get('_class') != 'symbolMaster': continue
                try:
                    symbol = extract_layer(layer)
                    catalog['symbols'].append(symbol)
                except Exception:
                    pass  # skip malformed symbols
        
        print(f'  Symbols: {len(catalog["symbols"])}')
    
    # Strip leaf-level empty children arrays for compact output
    def compact(obj):
        if isinstance(obj, dict):
            if 'children' in obj:
                if not obj['children']:
                    del obj['children']
                else:
                    for c in obj['children']: compact(c)
            return obj
        return obj
    
    catalog['symbols'] = [compact(s) for s in catalog['symbols']]
    
    with open(out_name, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)
    
    size_mb = os.path.getsize(out_name) / (1024*1024)
    print(f'\nOutput: {out_name} ({size_mb:.1f} MB)')
    print(f'Swatches: {len(catalog["swatches"])}, Symbols: {len(catalog["symbols"])}')

if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'Apple iOS 27 UI Kit.sketch'
    main(path)
