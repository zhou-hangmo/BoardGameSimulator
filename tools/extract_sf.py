"""SF Symbols extractor — one-shot script"""
import struct, zlib, gzip, os, sys

def main(pkg_path, out):
    os.makedirs(out, exist_ok=True)
    
    with open(pkg_path, 'rb') as f:
        # xar header: read all fields, then seek to TOC
        assert f.read(4) == b'xar!'
        header_sz = struct.unpack('>H', f.read(2))[0]
        f.read(2)  # version
        toc_c = struct.unpack('>Q', f.read(8))[0]
        f.read(8); f.read(4)  # toc_raw, checksum
        # pad to header_sz, then read TOC data
        consumed = 4+2+2+8+8+4
        if consumed < header_sz: f.read(header_sz - consumed)
        toc_data = f.read(toc_c)
        heap = f.tell()
        
        # Find Payload offset from TOC
        xml = zlib.decompress(toc_data).decode('utf-8')
        import xml.etree.ElementTree as ET
        root = ET.fromstring(xml)
        payload_off = payload_sz = None
        def walk(el):
            nonlocal payload_off, payload_sz
            if el.tag == 'file' and (el.find('name').text or '').strip() == 'Payload':
                dt = el.find('data')
                if dt is not None:
                    payload_off = int(dt.find('offset').text)
                    payload_sz = int(dt.find('size').text)
            for c in el: walk(c)
        walk(root)
        print(f'Payload: {payload_sz} bytes at offset {payload_off}')
        
        # Stream-decompress and extract cpio
        f.seek(heap + payload_off)
        decomp = gzip.GzipFile(fileobj=f)
        data = decomp.read()
        decomp.close()
        print(f'Decompressed: {len(data)} bytes')
        
        # Parse odc cpio with resilience
        pos = 0; count = 0; last_ok = pos
        while pos < len(data) - 76:
            hdr = data[pos:pos+76]
            if hdr[:6] != b'070707':
                # Skip bad bytes, but don't give up too quickly
                if pos - last_ok > 1000: break  # give up after 1KB of junk
                pos += 1; continue
            try:
                namesize = int(hdr[59:65], 8)
                filesize = int(hdr[65:76], 8)
            except: pos += 1; continue
            ds = pos + 76
            name = data[ds:ds+namesize-1].decode('utf-8', errors='replace') if namesize > 1 else ''
            fs = ds + namesize
            pos = fs + filesize
            if pos % 2: pos += 1
            last_ok = pos
            if name in ('.', 'TRAILER!!!', '') or name.endswith('/'): continue
            if filesize > 0:
                safe_parts = []
                for p in name.lstrip('./').split('/'):
                    safe_parts.append(''.join(c if 32<=ord(c)<127 else '_' for c in p))
                safe = '/'.join(safe_parts)
                if not safe: continue
                dst = os.path.join(out, safe)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                try:
                    with open(dst, 'wb') as wf: wf.write(data[fs:fs+filesize])
                    count += 1
                    if count % 500 == 0: print(f'  [{count}] {safe} ({filesize}b)')
                except OSError: continue
        print(f'Done: {count} files (ended at pos {pos}/{len(data)})')

if __name__ == '__main__':
    pkg = sys.argv[1] if len(sys.argv)>1 else 'SF-Symbols-7/SFSymbols/SF Symbols.pkg'
    out = sys.argv[2] if len(sys.argv)>2 else 'sf-symbols'
    main(pkg, out)
