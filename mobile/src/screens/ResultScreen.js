// ResultScreen.js — shows stripped files, lets user save or share
// TODO: add share to specific app (WhatsApp, Telegram etc)
// TODO: show before/after file size comparison
// TODO: add option to delete originals after stripping

import React from "react"
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Image, Alert, ScrollView
} from "react-native"
import Share from "react-native-share"
import RNFS from "react-native-fs"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export default function ResultScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const { files } = route.params

  async function shareFile(file) {
    try {
      await Share.open({
        url:   "file://" + file.outPath,
        type:  "image/jpeg",
        title: "Share clean photo"
      })
    } catch (err) {
      // user cancelled share — not an error
      if (!err.message?.includes("cancel")) {
        Alert.alert("Share failed", err.message)
      }
    }
  }

  async function shareAll() {
    try {
      await Share.open({
        urls:  files.map(f => "file://" + f.outPath),
        type:  "image/*",
        title: "Share clean photos"
      })
    } catch (err) {
      if (!err.message?.includes("cancel")) {
        Alert.alert("Share failed", err.message)
      }
    }
  }

  async function saveToGallery(file) {
    try {
      // copy to Pictures/purepic folder
      const destDir  = RNFS.PicturesDirectoryPath + "/purepic"
      const destPath = destDir + "/" + file.name

      await RNFS.mkdir(destDir)
      await RNFS.copyFile(file.outPath, destPath)

      // tell media scanner about the new file
      await RNFS.scanFile(destPath)

      Alert.alert("Saved!", "Clean photo saved to Pictures/purepic")
    } catch (err) {
      Alert.alert("Save failed", err.message)
    }
  }

  async function saveAllToGallery() {
    try {
      const destDir = RNFS.PicturesDirectoryPath + "/purepic"
      await RNFS.mkdir(destDir)

      for (const file of files) {
        const destPath = destDir + "/" + file.name
        await RNFS.copyFile(file.outPath, destPath)
        await RNFS.scanFile(destPath)
      }

      Alert.alert("Saved!", files.length + " clean photos saved to Pictures/purepic")
    } catch (err) {
      Alert.alert("Save failed", err.message)
    }
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>

      <View style={styles.banner}>
        <Text style={styles.bannerIcon}>✓</Text>
        <View>
          <Text style={styles.bannerTitle}>{files.length} photo{files.length !== 1 ? "s" : ""} cleaned</Text>
          <Text style={styles.bannerSub}>metadata has been removed</Text>
        </View>
      </View>

      <FlatList
        data={files}
        keyExtractor={item => item.uri}
        style={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Image source={{ uri: "file://" + item.outPath }} style={styles.thumb} />
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.sub}>metadata removed</Text>
            </View>
            <View style={styles.rowBtns}>
              <TouchableOpacity style={styles.rowBtn} onPress={() => saveToGallery(item)}>
                <Text style={styles.rowBtnText}>save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rowBtn} onPress={() => shareFile(item)}>
                <Text style={styles.rowBtnText}>share</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <TouchableOpacity style={styles.btnSecondary} onPress={saveAllToGallery}>
          <Text style={styles.btnSecondaryText}>save all</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimary} onPress={shareAll}>
          <Text style={styles.btnPrimaryText}>share all</Text>
        </TouchableOpacity>
      </View>

    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f13" },

  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    backgroundColor: "#1a1a22",
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a38"
  },
  bannerIcon:  { fontSize: 28, color: "#4dff91" },
  bannerTitle: { fontSize: 15, fontWeight: "700", color: "#e8e8f0" },
  bannerSub:   { fontSize: 12, color: "#666680", marginTop: 2 },

  list: { flex: 1 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a38",
    gap: 10
  },
  thumb: { width: 44, height: 44, borderRadius: 6, backgroundColor: "#1a1a22" },
  info:  { flex: 1 },
  name:  { fontSize: 13, color: "#e8e8f0", fontWeight: "500" },
  sub:   { fontSize: 11, color: "#4dff91", marginTop: 2 },

  rowBtns: { flexDirection: "row", gap: 6 },
  rowBtn:  {
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: "#1a1a22",
    borderRadius: 6, borderWidth: 1, borderColor: "#2a2a38"
  },
  rowBtnText: { fontSize: 12, color: "#e8e8f0", fontWeight: "600" },

  footer: {
    flexDirection: "row",
    gap: 10, padding: 12,
    borderTopWidth: 1, borderTopColor: "#2a2a38"
  },
  btnPrimary: {
    flex: 1, backgroundColor: "#7c6aff",
    borderRadius: 8, padding: 14, alignItems: "center"
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnSecondary: {
    flex: 1, backgroundColor: "#1a1a22",
    borderRadius: 8, padding: 14, alignItems: "center",
    borderWidth: 1, borderColor: "#2a2a38"
  },
  btnSecondaryText: { color: "#e8e8f0", fontWeight: "600", fontSize: 14 }
})
