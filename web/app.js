// app.js — purepic web
// strips exif/metadata from photos entirely in the browser
// uses canvas to re-encode the image which drops all metadata
// no server, no upload, nothing leaves the device

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

const yukiText    = document.getElementById('yuki-text')
const yukiBubble  = document.getElementById('yuki-bubble')

// ── drag and drop ─────────────────────────────────────────────────────────────

if (dzInner) {
  dzInner.addEventListener('click', () => fileInput.click())

  dzInner.addEventListener('dragover', e => {
    e.preventDefault()
    document.getElementById('dropzone').classList.add('over')
  })

  dzInner.addEventListener('dragleave', () => {
    document.getElementById('dropzone').classList.remove('over')
  })

  dzInner.addEventListener('drop', e => {
    e.preventDefault()
    document.getElementById('dropzone').classList.remove('over')
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (dropped.length) addFiles(dropped)
  })
}

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) addFiles(Array.from(fileInput.files))
  fileInput.value = '' // reset so same file can be picked again
})

// ── add files ────────────────────────────────────────────────────────────────

async function addFiles(newFiles) {
  for (const file of newFiles) {
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
    render()

    // read thumb and metadata in parallel
    const [thumb, meta] = await Promise.all([
      makeThumb(file),
      readExif(file).catch(() => null)
    ])

    entry.thumb  = thumb
    entry.meta   = meta
    entry.status = 'waiting'

    render()
  }
  updateYuki('loaded')
}

// ── exif reader ───────────────────────────────────────────────────────────────

async function readExif(file) {
  if (!file.type.includes('jpeg') && !file.name.toLowerCase().endsWith('.jpg')) {
    return null
  }

  const buf = await readFileBytes(file, 0, 65536) // scan first 64kb
  const view = new DataView(buf)

  if (view.getUint8(0) !== 0xFF || view.getUint8(1) !== 0xD8) return null

  const result = {}
  let offset = 2

  while (offset < buf.byteLength - 1) {
    const marker = view.getUint16(offset)
    if (marker === 0xFFE1) {
      const segLen = view.getUint16(offset + 2)
      const exifData = new DataView(buf, offset + 4, segLen - 2)
      parseExifSegment(exifData, result)
      break
    }
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
    if (view.getUint32(0) !== 0x45786966 || view.getUint16(4) !== 0x0000) return

    const tiffOffset = 6
    const byteOrder  = view.getUint16(tiffOffset)
    const le         = byteOrder === 0x4949

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
        case 0x010F: result.make     = readString(view, tiffOffset, entryOffset, le); break
        case 0x0110: result.model    = readString(view, tiffOffset, entryOffset, le); break
        case 0x0131: result.software = readString(view, tiffOffset, entryOffset, le); break
        case 0x013B: result.artist   = readString(view, tiffOffset, entryOffset, le); break
        case 0x0132: result.dateTime = readString(view, tiffOffset, entryOffset, le); break
        case 0x8825: result.gps      = 'location data found'; break
        case 0x9003: result.dateOrig = readString(view, tiffOffset, entryOffset, le); break
      }
    }

    if (result.make || result.model) {
      result.device = [result.make, result.model].filter(Boolean).join(' ').trim().slice(0, 40)
    }
    if (result.dateOrig || result.dateTime) {
      const raw = (result.dateOrig || result.dateTime).slice(0, 10)
      result.date = raw.replace(/:/g, '-')
    }
  } catch {}
}

function readString(view, tiffOffset, entryOffset, le) {
  try {
    const count  = le ? view.getUint32(entryOffset + 4, true) : view.getUint32(entryOffset + 4, false)
    const offset = le ? view.getUint32(entryOffset + 8, true) : view.getUint32(entryOffset + 8, false)
    if (count <= 4) {
      let s = ''
      for (let i = 0; i < count - 1; i++) {
        const c = view.getUint8(entryOffset + 8 + i)
        if (c === 0) break
        s += String.fromCharCode(c)
      }
      return s.trim() || null
    }
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
      const size = 96
      canvas.width  = size
      canvas.height = size
      const ctx = canvas.getContext('2d')

      const ratio = Math.max(size / img.width, size / img.height)
      const w = img.width  * ratio
      const h = img.height * ratio
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)

      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

// ── strip metadata ────────────────────────────────────────────────────────────

async function stripImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = img.naturalWidth
      canvas.height = img.naturalHeight

      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)

      URL.revokeObjectURL(url)

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
  stripBtn.textContent = 'Purifying...'
  updateYuki('processing')

  let hasErrors = false

  for (const entry of waiting) {
    entry.status = 'stripping'
    render()

    try {
      entry.cleanBlob = await stripImage(entry.file)
      entry.status = 'done'
    } catch (err) {
      entry.status = 'error'
      entry.error  = err.message
      hasErrors    = true
    }

    render()
  }

  stripBtn.disabled    = false
  stripBtn.textContent = '⚡ Purify Metadata'

  const done = files.filter(f => f.status === 'done')
  if (done.length) {
    downloadBtn.style.display = 'block'
  }
  
  updateYuki(hasErrors ? 'error' : 'done')
}

// ── download ──────────────────────────────────────────────────────────────────

function downloadAll() {
  const done = files.filter(f => f.status === 'done' && f.cleanBlob)
  for (const entry of done) {
    downloadBlob(entry.cleanBlob, 'purified-' + entry.name)
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── clear ─────────────────────────────────────────────────────────────────────

function clearAll() {
  files = []
  render()
  updateYuki('idle')
}
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

  const gpsCount  = files.filter(f => f.meta?.gps).length
  const doneCount = files.filter(f => f.status === 'done').length
  let countHtml   = `${files.length} photo${files.length !== 1 ? 's' : ''} loaded`
  if (gpsCount)  countHtml += ` · <span style="color:var(--red);text-shadow:0 0 8px rgba(255,77,109,0.3)">📍 ${gpsCount} with GPS</span>`
  if (doneCount) countHtml += ` · <span style="color:var(--green);text-shadow:0 0 8px rgba(0,245,212,0.3)">✓ ${doneCount} purified</span>`
  fileCount.innerHTML = countHtml

  downloadBtn.style.display = doneCount ? 'block' : 'none'

  fileList.innerHTML = files.map((entry, i) => {
    const thumbHtml = entry.thumb
      ? `<img class="file-thumb" src="${entry.thumb}" alt="" />`
      : `<div class="file-thumb" style="display:flex;align-items:center;justify-content:center;color:var(--muted)">⌛</div>`

    const tags = []
    if (entry.meta?.gps)      tags.push(`<span class="tag tag-gps">📍 GPS</span>`)
    if (entry.meta?.device)   tags.push(`<span class="tag tag-device">📱 ${entry.meta.device}</span>`)
    if (entry.meta?.software) tags.push(`<span class="tag tag-soft">🖥️ ${entry.meta.software}</span>`)
    if (entry.meta?.date)     tags.push(`<span class="tag tag-date">📅 ${entry.meta.date}</span>`)
    if (entry.status === 'done') tags.push(`<span class="tag tag-clean">✓ clean</span>`)

    const statusMap = {
      reading:   ['var(--yellow)', 'reading...'],
      waiting:   ['var(--muted)',  'waiting'],
      stripping: ['var(--yellow)', 'purifying...'],
      done:      ['var(--green)',  'purified ✓' + (entry.cleanBlob ? ` <span style="font-weight:700;cursor:pointer;text-decoration:underline;margin-left:6px;" onclick="downloadOne(${i})">↓ save</span>` : '')],
      error:     ['var(--red)',    'failed ✗']
    }
    const [statusColor, statusText] = statusMap[entry.status] || ['var(--muted)', '']

    return `
      <div class="file-row">
        ${thumbHtml}
        <div class="file-info">
          <div class="file-name" title="${entry.name}">${entry.name}</div>
          <div class="file-tags">${tags.join('') || '<span style="font-size:11px;color:var(--muted)">reading tags...</span>'}</div>
        </div>
        <div class="file-status" style="color:${statusColor}">${statusText}</div>
      </div>
    `
  }).join('')
}

window.downloadOne = function(i) {
  const entry = files[i]
  if (entry?.cleanBlob) downloadBlob(entry.cleanBlob, 'purified-' + entry.name)
}

window.stripAll    = stripAll
window.downloadAll = downloadAll

// ── yuki dialogue state engine ────────────────────────────────────────────────

function updateYuki(state) {
  if (!yukiText || !yukiBubble) return

  let msg = ''
  switch (state) {
    case 'idle':
      msg = "Hello! I'm Yuki, your cybersecurity partner. Load up some photos to check for tracking data!"
      break;
    case 'loaded':
      const gpsCount = files.filter(f => f.meta?.gps).length
      if (gpsCount > 0) {
        msg = `Aha! I found ${gpsCount} photo(s) containing precise location data. Let's purify them before sharing!`
      } else {
        msg = `Photos loaded successfully. I found some device metadata tags. Press 'Purify Metadata' to wipe them!`
      }
      break;
    case 'processing':
      msg = "Purifying photos... Re-encoding the image data and throwing away all metadata signatures. Hang tight!"
      break;
    case 'done':
      msg = "Purification complete! 🌟 All EXIF and location tracking logs are completely wiped. Safe to share!"
      break;
    case 'error':
      msg = "Oh no! An error occurred during purification. Let's check if the file format is supported."
      break;
  }

  // Smooth fade transition
  yukiBubble.style.opacity = '0.3'
  yukiBubble.style.transform = 'translateY(4px)'
  setTimeout(() => {
    yukiText.innerHTML = msg
    yukiBubble.style.opacity = '1'
    yukiBubble.style.transform = ''
  }, 200)
}

// ── particle engine ──────────────────────────────────────────────────────────

function initParticles() {
  const canvas = document.getElementById('particle-canvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  
  let particles = []
  const particleCount = 45
  let mouse = { x: null, y: null, radius: 120 }

  window.addEventListener('resize', resizeCanvas)
  window.addEventListener('mousemove', e => {
    mouse.x = e.clientX
    mouse.y = e.clientY
  })
  window.addEventListener('mouseleave', () => {
    mouse.x = null
    mouse.y = null
  })

  function resizeCanvas() {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  resizeCanvas()

  class Particle {
    constructor() {
      this.reset(true)
    }

    reset(init = false) {
      this.x = Math.random() * canvas.width
      this.y = init ? Math.random() * canvas.height : canvas.height + 20
      this.size = Math.random() * 5 + 2
      this.speedX = Math.random() * 1.5 - 0.75
      this.speedY = -(Math.random() * 1.2 + 0.5)
      // Purple accent or Pink accent particles
      this.color = Math.random() > 0.5 ? 'rgba(157, 78, 221, ' : 'rgba(255, 0, 127, '
      this.opacity = Math.random() * 0.35 + 0.15
      this.angle = Math.random() * Math.PI * 2
      this.spin = Math.random() * 0.02 - 0.01
    }

    update() {
      this.y += this.speedY
      this.x += this.speedX + Math.sin(this.angle) * 0.3
      this.angle += this.spin

      if (mouse.x !== null && mouse.y !== null) {
        const dx = this.x - mouse.x
        const dy = this.y - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < mouse.radius) {
          const force = (mouse.radius - dist) / mouse.radius
          this.x += (dx / dist) * force * 3
          this.y += (dy / dist) * force * 3
        }
      }

      if (this.y < -20 || this.x < -20 || this.x > canvas.width + 20) {
        this.reset(false)
      }
    }

    draw() {
      ctx.save()
      ctx.translate(this.x, this.y)
      ctx.rotate(this.angle)
      ctx.fillStyle = this.color + this.opacity + ')'
      
      // Draw cyber leaf/petal shape
      ctx.beginPath()
      ctx.moveTo(0, -this.size)
      ctx.quadraticCurveTo(this.size, -this.size, this.size, 0)
      ctx.quadraticCurveTo(this.size, this.size, 0, this.size)
      ctx.quadraticCurveTo(-this.size, this.size, -this.size, 0)
      ctx.quadraticCurveTo(-this.size, -this.size, 0, -this.size)
      ctx.fill()
      ctx.restore()
    }
  }

  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle())
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    particles.forEach(p => {
      p.update()
      p.draw()
    })
    requestAnimationFrame(animate)
  }
  animate()
}

// ── init ──────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  initParticles()
})
