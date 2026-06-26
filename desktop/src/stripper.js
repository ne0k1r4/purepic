// stripper.js — metadata removal using sharp

'use strict'

const sharp = require('sharp')
const fs    = require('fs-extra')
const path  = require('path')

// Read metadata and return summary
async function readMeta(filePath) {
  try {
    const meta = await sharp(filePath).metadata()
    const result = {}

    if (meta.exif) {
      const parsed = parseExif(meta.exif)
      if (parsed.gps)      result.gps      = parsed.gps
      if (parsed.device)   result.device   = parsed.device
      if (parsed.software) result.software = parsed.software
      if (parsed.date)     result.date     = parsed.date
    }

    if (meta.icc)  result.colorProfile = 'embedded'
    if (meta.iptc) result.iptc         = 'embedded'
    if (meta.xmp)  result.xmp          = 'embedded'

    return Object.keys(result).length ? result : null
  } catch {
    return null
  }
}

// Strip all metadata from image file
async function stripFile(inputPath, outputPath, opts = {}) {
  const ext = path.extname(inputPath).toLowerCase()

  await fs.ensureDir(path.dirname(outputPath))

  const q = opts.keepQuality ? 95 : 88

  let pipeline = sharp(inputPath).withMetadata(false)

  switch (ext) {
    case '.jpg':
    case '.jpeg':
      pipeline = pipeline.jpeg({ quality: q, mozjpeg: true })
      break

    case '.png':
      pipeline = pipeline.png({ compressionLevel: 7, adaptiveFiltering: true })
      break

    case '.webp':
      pipeline = pipeline.webp({ quality: q })
      break

    case '.tiff':
    case '.tif':
      pipeline = pipeline.tiff({ quality: 100, compression: 'lzw' })
      break

    default:
      throw new Error('unsupported format: ' + ext)
  }

  await pipeline.toFile(outputPath)
}

// Binary EXIF tag parser
function parseExif(buf) {
  const result = {}

  try {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    
    if (view.getUint32(0) !== 0x45786966 || view.getUint16(4) !== 0x0000) return result

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

  return result
}

// Read ASCII string value from TIFF header
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
  } catch {
    return null
  }
}

module.exports = { stripFile, readMeta }
