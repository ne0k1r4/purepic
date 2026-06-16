// stripper.js — core metadata removal logic
// uses sharp under the hood — it strips exif by default when reprocessing
// which is exactly what we need, no extra work required
//
// sharp docs: https://sharp.pixelplumbing.com
//
// TODO: add PDF metadata stripping via pdf-lib
// TODO: HEIC support needs @sharpen/heif or similar native binding
// TODO: video metadata stripping would need ffmpeg

'use strict'

const sharp = require('sharp')
const fs    = require('fs-extra')
const path  = require('path')

// reads metadata from a file and returns a human-readable summary
// returns null if nothing interesting found — caller decides what to do
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

    // icc = color profile, iptc = publisher info, xmp = adobe metadata
    if (meta.icc)  result.colorProfile = 'embedded'
    if (meta.iptc) result.iptc         = 'embedded'
    if (meta.xmp)  result.xmp          = 'embedded'

    return Object.keys(result).length ? result : null
  } catch {
    // file might be corrupt or unreadable — not crashing for this
    return null
  }
}

// strips ALL metadata by re-processing the image through sharp
// sharp strips exif/icc/iptc/xmp by default — we just make it explicit
// with withMetadata(false) to be absolutely sure
async function stripFile(inputPath, outputPath, opts = {}) {
  const ext = path.extname(inputPath).toLowerCase()

  await fs.ensureDir(path.dirname(outputPath))

  // quality setting — slightly lower when keepQuality is off saves more space
  const q = opts.keepQuality ? 95 : 88

  let pipeline = sharp(inputPath).withMetadata(false)

  // handle each format explicitly — lets us tune quality per format
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      // mozjpeg = better compression at same visual quality
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
      // lzw is lossless compression — tiff files are usually from cameras
      // so we want to preserve quality exactly
      pipeline = pipeline.tiff({ quality: 100, compression: 'lzw' })
      break

    default:
      throw new Error('unsupported format: ' + ext)
  }

  await pipeline.toFile(outputPath)
}

// basic exif parser — pulls the fields we actually care about showing
// not using a full exif library to keep deps light
// covers the most common metadata people dont know is there
function parseExif(buf) {
  const result = {}

  try {
    const str = buf.toString('latin1')

    // GPS — the most dangerous one
    // checking for GPS IFD marker (0x8825) or the string GPS in exif
    const hasGps = buf.indexOf(Buffer.from([0x88, 0x25])) > -1 || str.includes('GPS')
    if (hasGps) result.gps = 'location data found'

    // device detection — cover the most popular brands
    const devices = ['iPhone', 'iPad', 'Samsung', 'Pixel', 'OnePlus', 'Xiaomi',
                     'Canon', 'Nikon', 'Sony', 'Fujifilm', 'Olympus', 'Panasonic']
    for (const d of devices) {
      if (str.includes(d)) { result.device = d; break }
    }

    // software used to edit or take the photo
    const softwares = ['Lightroom', 'Photoshop', 'GIMP', 'Capture One',
                       'Snapseed', 'VSCO', 'Darkroom', 'Affinity Photo']
    for (const s of softwares) {
      if (str.includes(s)) { result.software = s; break }
    }

    // date the photo was taken — format is YYYY:MM:DD HH:MM:SS in exif
    const dateMatch = str.match(/20\d\d:\d\d:\d\d \d\d:\d\d:\d\d/)
    if (dateMatch) result.date = dateMatch[0].replace(/^(\d+):(\d+):(\d+)/, '$1-$2-$3')

  } catch {
    // parse failed — return whatever we have so far
  }

  return result
}

module.exports = { stripFile, readMeta }
