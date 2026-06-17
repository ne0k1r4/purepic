// MetaCard.js — reusable component that shows metadata tags on a file
// used in both HomeScreen and ResultScreen
// TODO: add tap to see full metadata details in a modal

import React from "react"
import { View, Text, StyleSheet } from "react-native"

export default function MetaCard({ meta }) {
  if (!meta) return null

  const tags = []
  if (meta.gps)      tags.push({ label: "GPS location", color: "#ff4d4d", icon: "📍" })
  if (meta.device)   tags.push({ label: meta.device,    color: "#ffd24d", icon: "📱" })
  if (meta.software) tags.push({ label: meta.software,  color: "#7c6aff", icon: "🖥" })
  if (meta.date)     tags.push({ label: meta.date.slice(0, 10).replace(/:/g, "-"), color: "#666680", icon: "📅" })

  if (!tags.length) return (
    <View style={styles.clean}>
      <Text style={styles.cleanText}>no metadata found</Text>
    </View>
  )

  return (
    <View style={styles.wrap}>
      {tags.map((tag, i) => (
        <View key={i} style={[styles.tag, { borderColor: tag.color + "44", backgroundColor: tag.color + "18" }]}>
          <Text style={styles.tagIcon}>{tag.icon}</Text>
          <Text style={[styles.tagLabel, { color: tag.color }]}>{tag.label}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap:  { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  tag:   {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 4, borderWidth: 1
  },
  tagIcon:  { fontSize: 10 },
  tagLabel: { fontSize: 10, fontWeight: "600" },
  clean:    { paddingVertical: 2 },
  cleanText: { fontSize: 11, color: "#4dff91" }
})
