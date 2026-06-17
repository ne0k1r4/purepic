// ios/Info.plist additions needed for photo access
// add these keys to your ios/purepic/Info.plist

/*
  NSPhotoLibraryUsageDescription
  PurePic needs access to your photos to strip their metadata

  NSPhotoLibraryAddUsageDescription  
  PurePic needs permission to save clean photos to your library
*/

// ios permissions — same as android but different API
// react-native-permissions handles both platforms

import { Platform } from "react-native"
import { request, PERMISSIONS, RESULTS } from "react-native-permissions"

export async function requestIOSPermissions() {
  if (Platform.OS !== "ios") return true

  try {
    // iOS 14+ needs limited or full photo library access
    const result = await request(PERMISSIONS.IOS.PHOTO_LIBRARY)

    if (result === RESULTS.GRANTED || result === RESULTS.LIMITED) {
      return true
    }

    // limited access — user picked specific photos only
    // still works for our use case since they pick photos themselves
    if (result === RESULTS.LIMITED) return true

    return false
  } catch {
    return false
  }
}

export async function requestAndroidPermissions() {
  if (Platform.OS !== "android") return true

  const { PermissionsAndroid, Platform: RNPlatform } = require("react-native")

  try {
    if (RNPlatform.Version >= 33) {
      const r = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
      )
      return r === PermissionsAndroid.RESULTS.GRANTED
    }

    const read = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
    )
    const write = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
    )
    return (
      read  === PermissionsAndroid.RESULTS.GRANTED &&
      write === PermissionsAndroid.RESULTS.GRANTED
    )
  } catch {
    return false
  }
}

// call this on app start — handles both platforms
export async function requestPermissions() {
  if (Platform.OS === "ios")     return requestIOSPermissions()
  if (Platform.OS === "android") return requestAndroidPermissions()
  return true
}
