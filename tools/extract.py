#!/usr/bin/env python3
"""
Apple Package Extractor — extracts .pkg (xar+gzip+cpio) and .sketch files.
Usage: python extract.py <file.pkg|.sketch> [output_dir]
"""
import struct, zlib, sys, os, re, io, gzip, shutil
import xml.etree.ElementTree as ET

def extract_xar(path, out_dir):
    """Extract xar archive (.pkg files)"""
    with open(path, 'rb') as f:
        assert f.read(4) == b'xar!', 'Not a xar archive'
        header_sz = struct.unpack('>H', f.read(2))[0]
        f.read(2)  # version
        toc_c = struct.unpack('>Q', f.read(8))[0]
        toc_r = struct.unpack('>Q', f.read(8))[0]
        f.read(4)  # checksum
        consumed = 28
        if consumed < header_sz: f.read(header_sz - consumed)
        toc_data = f.read(toc_c)
        heap = f.tell()
        xml_str = zlib.decompress(toc_data).decode('utf-8')
        print(f'  xar: TOC {len(xml_str)} chars, heap at {heap}')

        # Parse all file entries
        root = ET.fromstring(xml_str)
        
        def walk(el):
            files = []
            if el.tag == 'file':
                nm = el.find('name')
                dt = el.find('data')
                if nm is not None and dt is not None:
                    off = dt.find('offset')
                    sz = dt.find('size')
                    enc = dt.find('encoding')
                    if off is not None and sz is not None:
                        files.append({
                            'name': (nm.text or '').strip(),
                            'offset': int(off.text),
                            'size': int(sz.text),
                            'encoding': enc.get('style') if enc is not None else 'none',
                            'heap': heap,
                            'fh': f,
                        })
            for child in el:
                files.extend(walk(child))
            return files

        entries = walk(root)
        print(f'  xar: {len(entries)} file entries')
        return entries

def decompress(raw, encoding):
    if encoding in ('application/x-gzip', 'application/x-bzip2'):
        # Try gzip first
        try:
            return gzip.decompress(raw)
        except:
            pass
    if encoding == 'application/x-bzip2':
        try:
            import bz2
            return bz2.decompress(raw)
        except:
            pass
    # raw
    return raw

def extract_cpio(data, out_dir):
    """Extract cpio archive (supports newc and old binary/odc format)"""
    magic = data[:6]
    
    # Check for old binary format (ASCII "070707" as the actual bytes)
    is_odc = (magic == b'070707')
    is_newc = (magic in (b'070701', b'070702'))
    
    if not (is_odc or is_newc):
        print(f'  cpio: not recognized (magic: {magic})')
        return 0
    
    pos = 0
    count = 0
    hdr_len = 76 if is_odc else 110
    
    while pos < len(data) - hdr_len:
        hdr = data[pos:pos+hdr_len]
        
        if is_odc:
            # Old binary format: values are ASCII octal, space-separated
            # Header layout: magic(6) dev(6) ino(6) mode(6) uid(6) gid(6) nlink(6) rdev(6) mtime(11) namesize(6) filesize(11)
            try:
                fields = hdr[6:].split()
                if len(fields) < 5: pos += 1; continue
                mode = int(fields[2], 8) if len(fields) > 2 else 0
                filesize = int(fields[-1], 8) if fields[-1] else 0
                namesize = int(fields[-2], 8) if len(fields) >= 2 and fields[-2] else 0
            except (ValueError, IndexError):
                pos += 1; continue
        else:
            try:
                fields = hdr[6:].split(b'\x00')[:13]
                filesize = int(fields[6], 16)
                namesize = int(fields[11], 16)
            except (ValueError, IndexError):
                pos += 1; continue
        
        data_start = pos + hdr_len
        name_pad = (namesize + 3) & ~3 if namesize > 0 else 0
        name_end = data_start + namesize
        name = data[data_start:name_end].rstrip(b'\x00').decode('utf-8', errors='replace')
        file_start = pos + hdr_len + name_pad if is_odc else pos + 110 + name_pad
        if is_odc:
            file_start = pos + hdr_len + namesize
            # name may not be padded in odc
        file_data = data[file_start:file_start + filesize]
        
        pos = file_start + filesize
        if pos % 2 and is_odc: pos += 1  # odc pads to even
        elif not is_odc and pos % 4: pos += 4 - (pos % 4)
        
        if name in ('.', 'TRAILER!!!', '') or name.endswith('/'):
            if name == 'TRAILER!!!': break
            continue
        
        if filesize > 0:
            # Sanitize filename
            safe_name = ''.join(c if 32 <= ord(c) < 127 else '_' for c in name)
            if not safe_name or len(safe_name) > 200:
                continue
            dst = os.path.join(out_dir, safe_name.lstrip('/').lstrip('./'))
            try:
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                with open(dst, 'wb') as wf:
                    wf.write(file_data)
                count += 1
                ext = os.path.splitext(safe_name)[1].lower()
                if count % 200 == 0 or ext in ('.svg','.ttf','.otf'):
                    marker = ' 📄' if ext in ('.svg','.ttf','.otf') else ''
                    print(f'    [{count}] {safe_name} ({filesize}b){marker}')
            except OSError:
                continue
    
    return count

def extract_sketch(path, out_dir):
    """Extract .sketch file (ZIP format) — extract images and parse colors"""
    import zipfile
    with zipfile.ZipFile(path, 'r') as z:
        # Extract all images
        img_count = 0
        for f in z.namelist():
            if f.startswith('images/') or f.startswith('fonts/'):
                z.extract(f, out_dir)
                img_count += 1
        
        # Read document.json for colors
        try:
            doc = z.read('document.json')
            data = json.loads(doc)
            colors = extract_sketch_colors(data)
            print(f'  sketch: {img_count} images/fonts')
            if colors:
                print(f'  sketch: {len(colors)} shared styles found')
                with open(os.path.join(out_dir, '_colors.json'), 'w') as cf:
                    json.dump(colors, cf, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f'  sketch: document.json parse skipped ({e})')
    
    return img_count

def extract_sketch_colors(data):
    """Extract color/style info from sketch document"""
    colors = []
    try:
        # layerTextStyles, layerStyles, sharedStyles
        for key in ['layerTextStyles', 'layerStyles', 'sharedStyles']:
            styles = data.get(key, {}).get('objects', [])
            for s in styles:
                name = s.get('name', 'unnamed')
                val = s.get('value', {})
                fills = val.get('fills', [])
                for fill in fills:
                    c = fill.get('color', {})
                    if c:
                        r, g, b = round(c.get('red',0)*255), round(c.get('green',0)*255), round(c.get('blue',0)*255)
                        a = c.get('alpha', 1)
                        colors.append({
                            'name': name,
                            'hex': f'#{r:02x}{g:02x}{b:02x}',
                            'alpha': round(a, 2),
                            'css': f'rgba({r},{g},{b},{a:.2f})'
                        })
    except:
        pass
    return colors

import json

# ============ MAIN ============
if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python extract.py <file.pkg|.sketch> [output_dir]")
        sys.exit(1)

    path = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else path.replace('.pkg','').replace('.sketch','') + '_extracted'
    os.makedirs(out, exist_ok=True)

    if path.endswith('.sketch'):
        print(f'Sketch: {path}')
        n = extract_sketch(path, out)
        print(f'\nDone. {n} files to {out}')
        sys.exit(0)

    # --- PKG extraction ---
    print(f'Extracting: {path}')
    
    # Open file once and keep it open
    pkgf = open(path, 'rb')
    assert pkgf.read(4) == b'xar!', 'Not a xar archive'
    header_sz = struct.unpack('>H', pkgf.read(2))[0]
    pkgf.read(2)  # version
    toc_c = struct.unpack('>Q', pkgf.read(8))[0]
    pkgf.read(8)  # toc_raw
    pkgf.read(4)  # checksum
    consumed = 28
    if consumed < header_sz: pkgf.read(header_sz - consumed)
    toc_data = pkgf.read(toc_c)
    heap = pkgf.tell()
    xml_str = zlib.decompress(toc_data).decode('utf-8')
    print(f'  xar: TOC {len(xml_str)} chars, heap at {heap}')

    # Parse TOC to find Payload offset
    root = ET.fromstring(xml_str)
    payload_info = {}  # use dict to avoid nonlocal
    def walk(el):
        if el.tag == 'file':
            nm = el.find('name')
            if nm is not None and (nm.text or '').strip() == 'Payload':
                dt = el.find('data')
                if dt is not None:
                    off = dt.find('offset'); sz = dt.find('size')
                    if off is not None and sz is not None:
                        payload_info['offset'] = int(off.text)
                        payload_info['size'] = int(sz.text)
        for child in el: walk(child)
    walk(root)
    
    if not payload_info:
        print('Payload not found'); pkgf.close(); sys.exit(1)
    
    print(f"  Payload: {payload_info['size']} bytes at offset {payload_info['offset']}")
    
    # Seek to Payload, read, decompress
    pkgf.seek(heap + payload_info['offset'])
    raw = pkgf.read(payload_info['size'])
    pkgf.close()
    
    data = decompress(raw, 'application/x-gzip')
    print(f'  Payload decompressed: {len(data)} bytes')

    # Extract cpio
    print(f'  Extracting cpio...')
    n = extract_cpio(data, out)
    print(f'\nDone. {n} files extracted to {out}')
