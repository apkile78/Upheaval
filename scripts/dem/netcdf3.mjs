/**
 * Minimal NetCDF-3 classic reader (CDF-1/CDF-2). Big-endian, no dependencies.
 * Returns dimensions, global attributes, and variable descriptors with data
 * accessors. Used by the Earth DEM converter for NOAA THREDDS NCSS output.
 */

const NC_TYPES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 4, 6: 8 };

/** Read a NetCDF "name": 4-byte length + chars padded to 4-byte boundary. */
function readName(view, off) {
  const n = view.getUint32(off, false);
  const text = new TextDecoder().decode(new Uint8Array(view.buffer, off + 4, n));
  return { name: text, next: off + 4 + ((n + 3) & ~3) };
}

/** List reader shared by dim_list, gatt_list, var_list.
 * Layout: ABSENT = two zero words; present = tag (10|11|12), nelems, elements. */
function readList(view, off, readElement) {
  const tag = view.getUint32(off, false);
  if (tag === 0) return { items: [], next: off + 8 };
  const nelems = view.getUint32(off + 4, false);
  let p = off + 8;
  const items = [];
  for (let i = 0; i < nelems; i++) {
    const r = readElement(p);
    items.push(r.item);
    p = r.next;
  }
  return { items, next: p };
}

export function parseNetcdf3(buffer) {
  const view = new DataView(buffer);
  const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 3));
  if (magic !== 'CDF') throw new Error('Not a NetCDF classic file');
  const cdf2 = view.getUint8(3) === 2;
  const beginSize = cdf2 ? 8 : 4;
  let p = 4;
  p += 4; // numrecs (no record vars expected)

  // Dimensions
  const dims = readList(view, p, (q) => {
    const n = readName(view, q);
    const length = view.getUint32(n.next, false);
    return { item: { name: n.name, length }, next: n.next + 4 };
  });
  p = dims.next;

  // Global attributes
  const gattrs = readList(view, p, (q) => readAttr(view, q));
  p = gattrs.next;

  // Variables
  const vars = readList(view, p, (q) => {
    const n = readName(view, q);
    q = n.next;
    const ndims = view.getUint32(q, false);
    q += 4;
    const dimIds = [];
    for (let d = 0; d < ndims; d++) dimIds.push(view.getUint32(q + d * 4, false));
    q += ndims * 4;
    const attrs = readList(view, q, (r) => readAttr(view, r));
    q = attrs.next;
    const type = view.getUint32(q, false);
    const vsize = view.getUint32(q + 4, false);
    let begin = 0;
    if (beginSize === 8) begin = Number(view.getBigUint64(q + 8, false));
    else begin = view.getUint32(q + 8, false);
    return {
      item: { name: n.name, dimIds, type, vsize, begin, attrs: attrs.items },
      next: q + 8 + beginSize,
    };
  });

  return { dims: dims.items, attrs: gattrs.items, vars: vars.items, view, beginSize };
}

function readAttr(view, off) {
  const n = readName(view, off);
  const type = view.getUint32(n.next, false);
  const nelems = view.getUint32(n.next + 4, false);
  return {
    item: { name: n.name, type, nelems },
    next: n.next + 8 + Math.ceil((NC_TYPES[type] * nelems) / 4) * 4,
  };
}

/** Read a full non-record variable into a typed array (big-endian decoded). */
export function readVariable(nc, varName) {
  const v = nc.vars.find((x) => x.name === varName);
  if (!v) throw new Error('Variable not found: ' + varName);
  const total = v.dimIds.reduce((acc, id) => acc * nc.dims[id].length, 1);
  const view = nc.view;
  if (v.type === 3) {
    const out = new Int16Array(total);
    for (let i = 0; i < total; i++) out[i] = view.getInt16(v.begin + i * 2, false);
    return out;
  }
  if (v.type === 4) {
    const out = new Int32Array(total);
    for (let i = 0; i < total; i++) out[i] = view.getInt32(v.begin + i * 4, false);
    return out;
  }
  if (v.type === 5) {
    const out = new Float32Array(total);
    for (let i = 0; i < total; i++) out[i] = view.getFloat32(v.begin + i * 4, false);
    return out;
  }
  if (v.type === 6) {
    const out = new Float64Array(total);
    for (let i = 0; i < total; i++) out[i] = view.getFloat64(v.begin + i * 8, false);
    return out;
  }
  throw new Error('Unsupported variable type: ' + v.type);
}
