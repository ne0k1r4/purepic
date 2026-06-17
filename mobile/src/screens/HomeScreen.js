// HomeScreen.js — main screen where user picks photos
// TODO: add batch select from gallery
// TODO: show storage permission rationale if denied
// TODO: add recent files list so they dont have to re-pick

import React, { useState } from "react"
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Image, ActivityIndicator, Alert
} from "react-native"
import { launchImageLibrary } from "react-native-image-picker"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { stripMetadata, readMetadata } from "../utils/stripper"

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [files,    setFiles]    = useState([])
  const [loading,  setLoading]  = useState(false)

  // pick images from gallery
  async function pickImages() {
    const result = await launchImageLibrary({
      mediaType: "photo",
      selectionLimit: 0,  // 0 = unlimited
      includeBase64: false,
      presentationStyle: "pageSheet"
    })

    if (result.didCancel || !result.assets?.length) return

    // read metadata for each picked file
    const picked = await Promise.all(
      result.assets.map(async asset => {
        const meta = await readMetadata(asset.uri).catch(() => ({}))
        return {
          uri:    asset.uri,
          name:   asset.fileName || asset.uri.split("/").pop(),
          size:   asset.fileSize,
          meta,
          status: "waiting"
        }
      })
    )

    // merge — skip dupes
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.uri))
      return [...prev, ...picked.filter(f => !existing.has(f.uri))]
    })
  }

  async function stripAll() {
    if (!files.length) return

    const waiting = files.filter(f => f.status === "waiting")
    if (!waiting.length) return

    setLoading(true)

    const results = []
    for (const file of waiting) {
      // update status to processing
      setFiles(prev => prev.map(f =>
        f.uri === file.uri ? { ...f, status: "processing" } : f
      ))

      try {
        const outPath = await stripMetadata(file.uri)
        const meta    = file.meta

        setFiles(prev => prev.map(f =>
          f.uri === file.uri ? { ...f, status: "done", outPath } : f
        ))

        results.push({ ...file, outPath, status: "done" })
      } catch (err) {
        setFiles(prev => prev.map(f =>
          f.uri === file.uri ? { ...f, status: "error", error: err.message } : f
        ))
      }
    }

    setLoading(false)

    // go to results screen with done files
    if (results.length) {
      navigation.navigate("Result", { files: results })
    }
  }

  function clearFiles() {
    if (!files.length) return
    Alert.alert("Clear all?", "Remove all files from the list?", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear",  style: "destructive", onPress: () => setFiles([]) }
    ])
  }

  const doneCount    = files.filter(f => f.status === "done").length
  const waitingCount = files.filter(f => f.status === "waiting").length
  const gpsCount     = files.filter(f => f.meta?.gps).length

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>

      {/* empty state */}
      {!files.length && (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🖼️</Text>
          <Text style={styles.emptyTitle}>no photos added</Text>
          <Text style={styles.emptySubtitle}>
            pick photos from your gallery to{"
"}strip their metadata
          </Text>
        </View>
      )}

      {/* file list */}
      {files.length > 0 && (
        <FlatList
          data={files}
          keyExtractor={item => item.uri}
          style={styles.list}
          renderItem={({ item }) => (
            <FileRow file={item} />
          )}
        />
      )}

      {/* stats bar */}
      {files.length > 0 && (
        <View style={styles.stats}>
          <Text style={styles.statsText}>
            {files.length} photo{files.length !== 1 ? "s" : ""}
            {gpsCount > 0 && (
              <Text style={styles.gpsWarn}>  ⚠ {gpsCount} with GPS</Text>
            )}
            {doneCount > 0 && (
              <Text style={styles.done}>  ✓ {doneCount} done</Text>
            )}
          </Text>
        </View>
      )}

      {/* bottom buttons */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.btnSecondary} onPress={pickImages}>
          <Text style={styles.btnSecondaryText}>+ add photos</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnPrimary, (!waitingCount || loading) && styles.btnDisabled]}
          onPress={stripAll}
          disabled={!waitingCount || loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.btnPrimaryText}>strip metadata</Text>
          }
        </TouchableOpacity>
      </View>

      {/* clear button */}
      {files.length > 0 && (
        <TouchableOpacity style={styles.clearBtn} onPress={clearFiles}>
          <Text style={styles.clearText}>clear all</Text>
        </TouchableOpacity>
      )}

    </View>
  )
}

// individual file row in the list
function FileRow({ file }) {
  const statusColor = {
    waiting:    "#666680",
    processing: "#ffd24d",
    done:       "#4dff91",
    error:      "#ff4d4d"
  }[file.status]

  const statusLabel = {
    waiting:    "waiting",
    processing: "stripping...",
    done:       "done ✓",
    error:      "failed"
  }[file.status]

  return (
    <View style={styles.row}>
      <Image source={{ uri: file.uri }} style={styles.thumb} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{file.name}</Text>
        <View style={styles.rowTags}>
          {file.meta?.gps    && <Tag label="GPS"    color="#ff4d4d" />}
          {file.meta?.device && <Tag label={file.meta.device} color="#ffd24d" />}
          {file.meta?.date   && <Tag label={file.meta.date.slice(0, 10)} color="#666680" />}
        </View>
      </View>
      <Text style={[styles.rowStatus, { color: statusColor }]}>
        {statusLabel}
      </Text>
    </View>
  )
}

function Tag({ label, color }) {
  return (
    <View style={[styles.tag, { borderColor: color + "44", backgroundColor: color + "18" }]}>
      <Text style={[styles.tagText, { color }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f13" },

  empty: {
    flex: 1, alignItems: "center", justifyContent: "center", padding: 32
  },
  emptyIcon:     { fontSize: 48, marginBottom: 12 },
  emptyTitle:    { fontSize: 18, fontWeight: "700", color: "#e8e8f0", marginBottom: 8 },
  emptySubtitle: { fontSize: 13, color: "#666680", textAlign: "center", lineHeight: 20 },

  list: { flex: 1 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a38",
    gap: 10
  },
  thumb:      { width: 44, height: 44, borderRadius: 6, backgroundColor: "#1a1a22" },
  rowInfo:    { flex: 1, gap: 4 },
  rowName:    { fontSize: 13, color: "#e8e8f0", fontWeight: "500" },
  rowTags:    { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  rowStatus:  { fontSize: 11, fontWeight: "600", flexShrink: 0 },

  tag: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, borderWidth: 1
  },
  tagText: { fontSize: 10, fontWeight: "600" },

  stats: {
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#2a2a38"
  },
  statsText: { fontSize: 12, color: "#666680" },
  gpsWarn:   { color: "#ff4d4d" },
  done:      { color: "#4dff91" },

  footer: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#2a2a38"
  },

  btnPrimary: {
    flex: 1, backgroundColor: "#7c6aff",
    borderRadius: 8, padding: 14,
    alignItems: "center"
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnDisabled:    { opacity: 0.4 },

  btnSecondary: {
    flex: 1, backgroundColor: "#1a1a22",
    borderRadius: 8, padding: 14,
    alignItems: "center",
    borderWidth: 1, borderColor: "#2a2a38"
  },
  btnSecondaryText: { color: "#e8e8f0", fontWeight: "600", fontSize: 14 },

  clearBtn:  { alignItems: "center", paddingBottom: 8 },
  clearText: { fontSize: 12, color: "#666680" }
})
