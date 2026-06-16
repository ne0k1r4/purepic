// utils.js — desktop helper functions and validation utilities

'use strict'

/**
 * Format bytes into human-readable file sizes (e.g. B, KB, MB)
 * @param {number} n bytes
 * @returns {string} formatted string
 */
function formatBytes(n) {
  if (n < 1024)    return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1048576).toFixed(1) + ' MB'
}

/**
 * Basic URL validation helper
 * @param {string} urlStr
 * @returns {boolean}
 */
function isValidUrl(urlStr) {
  try {
    new URL(urlStr)
    return true
  } catch {
    return false
  }
}

module.exports = {
  formatBytes,
  isValidUrl
}
