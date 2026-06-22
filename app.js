// app.js — purepic web
// strips exif/metadata from photos entirely in the browser
// uses canvas to re-encode the image which drops all metadata
// no server, no upload, nothing leaves the device
//
// how it works:
//   1. read the file with FileReader
//   2. parse EXIF tags from the raw bytes before re-encoding
//   3. draw the image onto a canvas element
//   4. export canvas as blob — canvas output has zero metadata
//   5. offer the clean blob as a download
//
// TODO: add zip download for batch (using JSZip or native)
// TODO: show before/after file size comparison
// TODO: drag to reorder files in the list
// TODO: add paste from clipboard support (ctrl+v)

'use strict'

// ── state ────────────────────────────────────────────────────────────────────

// each entry: { file, name, thumb, meta, status, cleanBlob }
let files = []

// ── dom refs ─────────────────────────────────────────────────────────────────

const fileInput   = document.getElementById('file-input')
const dzInner     = document.getElementById('dz-inner')
const fileSection = document.getElementById('file-section')
const fileList    = document.getElementById('file-list')
const fileCount   = document.getElementById('file-count')
const actionBar   = document.getElementById('action-bar')
const stripBtn    = document.getElementById('strip-btn')
const downloadBtn = document.getElementById('download-btn')

// ── drag and drop ─────────────────────────────────────────────────────────────

dzInner.addEventListener('click', () => fileInput.click())

dzInner.addEventListener('dragover', e => {
  e.preventDefault()
  dzInner.style.borderColor = 'var(--accent)'
  dzInner.style.background  = 'rgba(124,106,255,0.06)'
})

dzInner.addEventListener('dragleave', () => {
  dzInner.style.borderColor = ''
  dzInner.style.background  = ''
})

dzInner.addEventListener('drop', e => {
  e.preventDefault()
  dzInner.style.borderColor = ''
  dzInner.style.background  = ''
  const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
  if (dropped.length) addFiles(dropped)
})

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) addFiles(Array.from(fileInput.files))
  fileInput.value = '' // reset so same file can be picked again
})

// ── add files ────────────────────────────────────────────────────────────────

async function addFiles(newFiles) {
  for (const file of newFiles) {
    // skip dupes by name+size — not perfect but good enough
    const dupe = files.find(f => f.name === file.name && f.file.size === file.size)
    if (dupe) continue

    const entry = {
      file,
      name:      file.name,
      thumb:     null,
      meta:      null,
      status:    'reading',
      cleanBlob: null
    }
    files.push(entry)

    // read thumb and metadata in parallel — faster
    const [thumb, meta] = await Promise.all([
      makeThumb(file),
      readExif(file).catch(() => null)
    ])

    entry.thumb  = thumb
    entry.meta   = meta
    entry.status = 'waiting'

    render()
  }
}

// ── exif reader ───────────────────────────────────────────────────────────────

// reads raw exif from the file bytes without any library
// exif is embedded in JPEG files as an APP1 marker (0xFFE1)
// we scan for known tags and pull the values we care about
async function readExif(file) {
  // only jpegs have EXIF in this format
  // png/webp might have XMP but thats less common — skip for now
  if (!file.type.includes('jpeg') && !file.name.toLowerCase().endsWith('.jpg')) {
    return null
  }

  const buf = await readFileBytes(file, 0, 65536) // first 64kb is enough for exif
  const view = new DataView(buf)

  // check JPEG magic bytes FF D8
  if (view.getUint8(0) !== 0xFF || view.getUint8(1) !== 0xD8) return null

  const result = {}
  let offset = 2

  // scan for APP1 marker (FF E1) which contains EXIF
  while (offset < buf.byteLength - 1) {
    const marker = view.getUint16(offset)
    if (marker === 0xFFE1) {
      // found APP1 — parse it
      const segLen = view.getUint16(offset + 2)
      const exifData = new DataView(buf, offset + 4, segLen - 2)
      parseExifSegment(exifData, result)
      break
    }
    // skip this segment
    if (offset + 2 >= buf.byteLength) break
    try {
      const segLen = view.getUint16(offset + 2)
      offset += 2 + segLen
    } catch { break }
  }

  return Object.keys(result).length ? result : null
}

function parseExifSegment(view, result) {
  try {
    // check for "Exif\0\0" header
    if (view.getUint32(0) !== 0x45786966 || view.getUint16(4) !== 0x0000) return

    const tiffOffset = 6
    const byteOrder  = view.getUint16(tiffOffset)
    const le         = byteOrder === 0x4949 // little-endian (Intel)

    const getU16 = (o) => view.getUint16(tiffOffset + o, le)
    const getU32 = (o) => view.getUint32(tiffOffset + o, le)

    const ifdOffset = getU32(4)
    const numEntries = getU16(ifdOffset)

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = ifdOffset + 2 + i * 12
      const tag  = getU16(entryOffset)
      const type = getU16(entryOffset + 2)
      const val  = getU32(entryOffset + 8)

      switch (tag) {
        case 0x010F: result.make     = readString(view, tiffOffset, entryOffset, le); break  // Make
        case 0x0110: result.model    = readString(view, tiffOffset, entryOffset, le); break  // Model
        case 0x0131: result.software = readString(view, tiffOffset, entryOffset, le); break  // Software
        case 0x013B: result.artist   = readString(view, tiffOffset, entryOffset, le); break  // Artist
        case 0x0132: result.dateTime = readString(view, tiffOffset, entryOffset, le); break  // DateTime
        case 0x8825: result.gps      = 'location data found'; break                          // GPSInfo IFD
        case 0x9003: result.dateOrig = readString(view, tiffOffset, entryOffset, le); break  // DateTimeOriginal
      }
    }

    // build friendly display values
    if (result.make || result.model) {
      result.device = [result.make, result.model].filter(Boolean).join(' ').trim().slice(0, 40)
    }
    if (result.dateOrig || result.dateTime) {
      const raw = (result.dateOrig || result.dateTime).slice(0, 10)
      result.date = raw.replace(/:/g, '-')
    }

  } catch {
    // parse failed — return what we have
  }
}

function readString(view, tiffOffset, entryOffset, le) {
  try {
    const count  = le ? view.getUint32(entryOffset + 4, true) : view.getUint32(entryOffset + 4, false)
    const offset = le ? view.getUint32(entryOffset + 8, true) : view.getUint32(entryOffset + 8, false)
    if (count <= 4) {
      // value fits inline
      let s = ''
      for (let i = 0; i < count - 1; i++) {
        const c = view.getUint8(entryOffset + 8 + i)
        if (c === 0) break
        s += String.fromCharCode(c)
      }
      return s.trim() || null
    }
    // value is at offset
    let s = ''
    for (let i = 0; i < Math.min(count - 1, 100); i++) {
      const c = view.getUint8(tiffOffset + offset + i)
      if (c === 0) break
      s += String.fromCharCode(c)
    }
    return s.trim() || null
  } catch { return null }
}

function readFileBytes(file, start, end) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsArrayBuffer(file.slice(start, end))
  })
}

// ── thumbnail generator ───────────────────────────────────────────────────────

function makeThumb(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const size = 80
      canvas.width  = size
      canvas.height = size
      const ctx = canvas.getContext('2d')

      // cover crop — same as css object-fit:cover
      const ratio = Math.max(size / img.width, size / img.height)
      const w = img.width  * ratio
      const h = img.height * ratio
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)

      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

// ── strip metadata ────────────────────────────────────────────────────────────

// the actual stripping — draw image to canvas, export as blob
// canvas output has zero metadata — all exif, xmp, iptc gone
async function stripImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = img.naturalWidth
      canvas.height = img.naturalHeight

      const ctx = canvas.getContext('2d')
      // white background for transparency handling (png with alpha)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)

      URL.revokeObjectURL(url)

      // export as jpeg — strips all metadata
      // for pngs we could use image/png but jpeg is smaller and metadata-free
      const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('canvas export failed'))
      }, outType, 0.95)
    }

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('failed to load image')) }
    img.src = url
  })
}

// ── strip all ─────────────────────────────────────────────────────────────────

async function stripAll() {
  const waiting = files.filter(f => f.status === 'waiting')
  if (!waiting.length) return

  stripBtn.disabled   = true
  stripBtn.textContent = 'Stripping...'

  for (const entry of waiting) {
    entry.status = 'stripping'
    render()

    try {
      entry.cleanBlob = await stripImage(entry.file)
      entry.status = 'done'
    } catch (err) {
      entry.status = 'error'
      entry.error  = err.message
    }

    render()
  }

  stripBtn.disabled    = false
  stripBtn.textContent = 'Strip Metadata'

  const done = files.filter(f => f.status === 'done')
  if (done.length) {
    downloadBtn.style.display = 'block'
  }
}

// ── download ──────────────────────────────────────────────────────────────────

function downloadAll() {
  const done = files.filter(f => f.status === 'done' && f.cleanBlob)
  for (const entry of done) {
    downloadBlob(entry.cleanBlob, 'clean-' + entry.name)
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  // clean up after a tick
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── clear ─────────────────────────────────────────────────────────────────────

function clearAll() {
  files = []
  render()
}
// expose globally so inline onclick can call it
window.clearAll = clearAll

// ── render ────────────────────────────────────────────────────────────────────

function render() {
  if (!files.length) {
    fileSection.style.display = 'none'
    actionBar.style.display   = 'none'
    return
  }

  fileSection.style.display = 'block'
  actionBar.style.display   = 'flex'

  // update count
  const gpsCount  = files.filter(f => f.meta?.gps).length
  const doneCount = files.filter(f => f.status === 'done').length
  let countText   = `${files.length} photo${files.length !== 1 ? 's' : ''}`
  if (gpsCount)  countText += ` · <span style="color:var(--red)">${gpsCount} with GPS</span>`
  if (doneCount) countText += ` · <span style="color:var(--green)">${doneCount} cleaned</span>`
  fileCount.innerHTML = countText

  // show/hide download button
  downloadBtn.style.display = doneCount ? 'block' : 'none'

  // file rows
  fileList.innerHTML = files.map((entry, i) => {
    const thumbHtml = entry.thumb
      ? `<img class="file-thumb" src="${entry.thumb}" alt="" />`
      : `<div class="file-thumb" style="background:var(--surface2);border-radius:6px;"></div>`

    // metadata tags
    const tags = []
    if (entry.meta?.gps)      tags.push(`<span class="tag tag-gps">📍 GPS</span>`)
    if (entry.meta?.device)   tags.push(`<span class="tag tag-device">📱 ${entry.meta.device}</span>`)
    if (entry.meta?.software) tags.push(`<span class="tag tag-soft">🖥 ${entry.meta.software}</span>`)
    if (entry.meta?.date)     tags.push(`<span class="tag tag-date">📅 ${entry.meta.date}</span>`)
    if (entry.status === 'done') tags.push(`<span class="tag tag-clean">✓ clean</span>`)

    // status text
    const statusMap = {
      reading:   ['var(--yellow)', 'reading...'],
      waiting:   ['var(--muted)',  'waiting'],
      stripping: ['var(--yellow)', 'stripping...'],
      done:      ['var(--green)',  '✓ done' + (entry.cleanBlob ? ` <span style="font-weight:400;cursor:pointer;text-decoration:underline" onclick="downloadOne(${i})">↓</span>` : '')],
      error:     ['var(--red)',    '✗ failed']
    }
    const [statusColor, statusText] = statusMap[entry.status] || ['var(--muted)', '']

    return `
      <div class="file-row">
        ${thumbHtml}
        <div class="file-info">
          <div class="file-name" title="${entry.name}">${entry.name}</div>
          <div class="file-tags">${tags.join('') || '<span style="font-size:11px;color:var(--muted)">reading metadata...</span>'}</div>
        </div>
        <div class="file-status" style="color:${statusColor}">${statusText}</div>
      </div>
    `
  }).join('')
}

// single file download — called from inline onclick
window.downloadOne = function(i) {
  const entry = files[i]
  if (entry?.cleanBlob) downloadBlob(entry.cleanBlob, 'clean-' + entry.name)
}

window.stripAll    = stripAll
window.downloadAll = downloadAll
