#!/usr/bin/env python3
"""
xar (.pkg) archive extractor for Windows
Extracts Apple SF Symbols .pkg files and similar xar-format archives.
Usage: python xar_extract.py <input.pkg> <output_dir>
"""

import struct, zlib, sys, os, io

def read_xar(path):
    with open(path, 'rb') as f:
        magic = f.read(4)
        if magic != b'xar!':
            raise ValueError("Not a xar archive")
        header_size = struct.unpack('>H', f.read(2))[0]
        version = struct.unpack('>H', f.read(2))[0]
        toc_len_compressed = struct.unpack('>Q', f.read(8))[0]
        toc_len_raw = struct.unpack('>Q', f.read(8))[0]
        cksum_algo = struct.unpack('>I', f.read(4))[0]
        # skip padding to align
        consumed = 4 + 2 + 2 + 8 + 8 + 4
        if consumed < header_size:
            f.read(header_size - consumed)
        toc_data = f.read(toc_len_compressed)
        heap_offset = f.tell()
        return toc_data, heap_offset, f

def parse_toc(toc_data, toc_len_raw):
    decompressed = zlib.decompress(toc_data)
    if len(decompressed) != toc_len_raw:
        print(f"Warning: TOC size mismatch: got {len(decompressed)}, expected {toc_len_raw}")
    return decompressed.decode('utf-8')

def extract_files(xml_str, heap_offset, file_handle, out_dir):
    """Simple XML parser to find <file> elements with id, name, offset, size."""
    import xml.etree.ElementTree as ET
    root = ET.fromstring(xml_str)
    files_found = 0
    ns = {'': ''}  # no namespace expected in TOC
    for elem in root.iter():
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
        if tag == 'file':
            fid = elem.find('file/id')
            name_el = elem.find('file/name')
            data_el = elem.find('file/data')
            if not all([fid, name_el, data_el]):
                # Nested structure: <file><id>...</id><name>...</name>...
                fid = elem.find('id')
                name_el = elem.find('name')
                data_el = elem.find('data')
            if data_el is None:
                # Might be a parent directory; recurse for children
                for child in elem:
                    ctag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
                    if ctag == 'file':
                        elem = child  # process nested
                        fid = elem.find('id')
                        name_el = elem.find('name')
                        data_el = elem.find('data')
                        break

            if not all([fid is not None, name_el is not None, data_el is not None]):
                continue

            try:
                name = name_el.text
                offset = int(data_el.find('offset').text)
                size = int(data_el.find('size').text)
                length = int(data_el.find('length').text) if data_el.find('length') is not None else size
                encoding = data_el.find('encoding')
                encoding_style = encoding.get('style') if encoding is not None else None
            except (AttributeError, ValueError):
                continue

            # Read file data from heap
            file_handle.seek(heap_offset + offset)
            raw = file_handle.read(size)

            # Decompress if needed
            if encoding_style == 'application/x-gzip':
                try:
                    raw = zlib.decompress(raw, 16+zlib.MAX_WBITS)
                except:
                    pass

            target = os.path.join(out_dir, name.lstrip('/'))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, 'wb') as out:
                out.write(raw)
            files_found += 1
            print(f"  → {name} ({size}b → {len(raw)}b)")
    return files_found

def main():
    if len(sys.argv) < 2:
        print("Usage: python xar_extract.py <input.pkg> [output_dir]")
        print("Example: python xar_extract.py 'SF Symbols.pkg' ./sf-symbols-output")
        sys.exit(1)

    pkg_path = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else pkg_path.replace('.pkg', '_extracted')
    print(f"Extracting: {pkg_path}")
    print(f"Output:    {out_dir}")
    print()

    toc_data, heap_offset, file_handle = read_xar(pkg_path)
    print(f"TOC compressed: {len(toc_data)} bytes, heap starts at offset {heap_offset}")

    xml_str = parse_toc(toc_data, 0)  # size check relaxed
    print(f"TOC XML decompressed: {len(xml_str)} chars")
    print()

    count = extract_files(xml_str, heap_offset, file_handle, out_dir)
    file_handle.close()
    print(f"\nDone. Extracted {count} files to {out_dir}")

if __name__ == '__main__':
    main()
