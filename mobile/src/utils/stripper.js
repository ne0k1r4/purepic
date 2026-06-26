import RNFS from "react-native-fs"
import Exif from "react-native-exif"
import { Image } from "react-native"

// reads metadata from a photo uri
// returns object with gps, device, date, software fields
export async function readMetadata(uri) {
  const result = {}

  try {
    const exif = await Exif.getExif(uri)

    // GPS — most important, shows where photo was taken
    if (exif.GPSLatitude || exif.GPSLongitude) {
      const lat = parseGps(exif.GPSLatitude,  exif.GPSLatitudeRef  || "N")
      const lng = parseGps(exif.GPSLongitude, exif.GPSLongitudeRef || "E")
      result.gps = lat.toFixed(4) + ", " + lng.toFixed(4)
    }

    // device info
    if (exif.Make || exif.Model) {
      result.device = [exif.Make, exif.Model].filter(Boolean).join(" ").trim()
    }

    // date taken
    if (exif.DateTime || exif.DateTimeOriginal) {
      result.date = exif.DateTimeOriginal || exif.DateTime
    }

    // software used to edit
    if (exif.Software) {
      result.software = exif.Software
    }

  } catch {
    // exif read failed — photo might have no metadata, thats fine
  }

  return Object.keys(result).length ? result : null
}

// strips metadata by re-encoding the image
// saves clean copy to app cache directory
// returns path to the clean file
export async function stripMetadata(uri) {
  // decode the uri to a file path
  const srcPath = uri.replace("file://", "")
  const fileName = srcPath.split("/").pop()
  const outDir   = RNFS.CachesDirectoryPath + "/purepic"
  const outPath  = outDir + "/" + fileName

  // make sure cache dir exists
  await RNFS.mkdir(outDir)

  // read the original file as base64
  const base64 = await RNFS.readFile(srcPath, "base64")

  // re-encode without metadata using canvas approach
  // this is the most reliable way on Android — native image round-trip strips exif
  const stripped = await reEncodeImage(base64, uri)

  // write the clean file
  await RNFS.writeFile(outPath, stripped, "base64")

  return outPath
}

// re-encodes image through React Native Image — strips all metadata
// quality 0.95 keeps it looking good without being huge
function reEncodeImage(base64, originalUri) {
  return new Promise((resolve, reject) => {
    // use ImageEditor to crop to same dimensions — this forces re-encode without exif
    // its a hack but it works consistently across Android versions
    // TODO: find a cleaner way that doesnt need ImageEditor
    Image.getSize(originalUri, (width, height) => {
      const ImageEditor = require("@react-native-community/image-editor").default
      ImageEditor.cropImage(originalUri, {
        offset: { x: 0, y: 0 },
        size:   { width, height },
        quality: 0.95
      })
      .then(uri => RNFS.readFile(uri.replace("file://", ""), "base64"))
      .then(resolve)
      .catch(reject)
    }, reject)
  })
}

// convert GPS DMS string to decimal degrees
// exif stores it as "40/1,26/1,46/1" format
function parseGps(dmsStr, ref) {
  if (!dmsStr) return 0
  try {
    const parts = dmsStr.split(",").map(p => {
      const [num, den] = p.trim().split("/")
      return parseFloat(num) / parseFloat(den || 1)
    })
    const decimal = parts[0] + parts[1] / 60 + (parts[2] || 0) / 3600
    return (ref === "S" || ref === "W") ? -decimal : decimal
  } catch {
    return 0
  }
}
