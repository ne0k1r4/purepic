#!/usr/bin/env node

// cli.js — purepic desktop entry point
// strips metadata from photos before you share them
// supports jpg, png, webp, tiff — basically anything sharp can handle
//
// usage:
//   node src/cli.js photo.jpg
//   node src/cli.js ./photos/
//   node src/cli.js *.jpg
//
// TODO: add --watch mode that auto-strips new files added to a folder
// TODO: add --config flag to pass options as json instead of answering prompts
// TODO: batch mode flag --yes to skip prompts and use defaults

'use strict'

const chalk    = require('chalk')
const fs       = require('fs-extra')
const path     = require('path')
const glob     = require('glob')
const inquirer = require('inquirer')
const { stripFile, readMeta } = require('./stripper')
const { formatBytes } = require('./utils')

// only formats sharp can handle cleanly
// heic/heif would be nice but needs native binding — leaving as TODO
const SUPPORTED = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif']

function banner() {
  console.log()
  console.log('  ' + chalk.bold.white('purepic') + chalk.gray(' · strip metadata before sharing'))
  console.log('  ' + chalk.gray('─'.repeat(42)))
  console.log()
}

// expand globs, resolve folders, filter to supported formats
// people pass all kinds of things — bare paths, globs, folders
function resolveFiles(inputs) {
  const files = []

  for (const input of inputs) {
    if (input.includes('*')) {
      // glob pattern — expand it
      files.push(...glob.sync(input))
    } else if (fs.existsSync(input)) {
      const stat = fs.statSync(input)
      if (stat.isDirectory()) {
        // folder — find all supported files recursively
        for (const ext of SUPPORTED) {
          files.push(...glob.sync(path.join(input, '**/*' + ext)))
        }
      } else {
        files.push(input)
      }
    } else {
      // file not found — warn but keep going
      console.log(chalk.yellow('  ⚠ not found:'), input)
    }
  }

  // dedupe and filter to supported formats only
  const unique = [...new Set(files)]
  return unique.filter(f => SUPPORTED.includes(path.extname(f).toLowerCase()))
}

async function askOptions() {
  return inquirer.prompt([
    {
      type: 'list',
      name: 'output',
      message: 'Save stripped files to:',
      choices: [
        { name: 'stripped/ folder next to originals (safe default)', value: 'folder' },
        { name: 'add -clean suffix  (photo-clean.jpg)',              value: 'suffix' },
        { name: 'overwrite originals (cannot be undone)',            value: 'overwrite' }
      ],
      default: 'folder'
    },
    {
      type: 'confirm',
      name: 'preview',
      message: 'Show what metadata was found before stripping?',
      default: true
    },
    {
      type: 'confirm',
      name: 'keepQuality',
      message: 'Keep high quality output?',
      default: true
    }
  ])
}

// figure out where to save the stripped file based on chosen mode
function getOutputPath(file, mode) {
  const dir  = path.dirname(file)
  const ext  = path.extname(file)
  const base = path.basename(file, ext)

  if (mode === 'overwrite') return file
  if (mode === 'suffix')    return path.join(dir, base + '-clean' + ext)

  // default — stripped/ subfolder
  const outDir = path.join(dir, 'stripped')
  fs.ensureDirSync(outDir)
  return path.join(outDir, path.basename(file))
}

async function main() {
  banner()

  const args = process.argv.slice(2)

  if (!args.length) {
    console.log(chalk.gray('  usage: node src/cli.js <file|folder|glob>'))
    console.log(chalk.gray('  examples:'))
    console.log(chalk.gray('    node src/cli.js photo.jpg'))
    console.log(chalk.gray('    node src/cli.js ./photos/'))
    console.log(chalk.gray('    node src/cli.js *.jpg'))
    console.log()
    process.exit(0)
  }

  const files = resolveFiles(args)

  if (!files.length) {
    console.log(chalk.red('  no supported files found'))
    console.log(chalk.gray('  supported formats: ' + SUPPORTED.join(', ')))
    process.exit(1)
  }

  console.log(chalk.cyan(`  found ${files.length} file(s)`))
  console.log()

  const opts = await askOptions()

  // show metadata preview — GPS is the scary one
  if (opts.preview) {
    console.log()
    console.log(chalk.bold('  metadata found:'))
    console.log()

    // only show first 5 so it doesnt spam the terminal
    for (const file of files.slice(0, 5)) {
      const meta = await readMeta(file).catch(() => null)
      if (!meta) {
        console.log('  ' + chalk.gray(path.basename(file)) + chalk.gray(' — no metadata'))
        continue
      }

      console.log('  ' + chalk.cyan(path.basename(file)))
      if (meta.gps)      console.log(chalk.red('    ⚠ GPS location: ') + meta.gps)
      if (meta.device)   console.log(chalk.yellow('    device:   ') + meta.device)
      if (meta.software) console.log(chalk.yellow('    software: ') + meta.software)
      if (meta.date)     console.log(chalk.yellow('    date:     ') + meta.date)
    }

    if (files.length > 5) {
      console.log(chalk.gray(`  ... and ${files.length - 5} more`))
    }
    console.log()
  }

  // extra confirmation before overwriting — this cant be undone
  if (opts.output === 'overwrite') {
    const { ok } = await inquirer.prompt([{
      type: 'confirm',
      name: 'ok',
      message: chalk.red('overwrite will replace your original files permanently — sure?'),
      default: false
    }])
    if (!ok) {
      console.log(chalk.gray('  cancelled'))
      process.exit(0)
    }
  }

  console.log()
  console.log(chalk.cyan('  stripping...'))
  console.log()

  let passed = 0
  let failed = 0

  for (const file of files) {
    const outPath = getOutputPath(file, opts.output)
    process.stdout.write('  ' + path.basename(file) + ' ... ')

    try {
      await stripFile(file, outPath, { keepQuality: opts.keepQuality })

      // show how much smaller the file got — satisfying
      const before = fs.statSync(file).size
      const after  = fs.statSync(outPath).size
      const diff   = before - after

      const sizeNote = diff > 0
        ? chalk.gray(` (${formatBytes(diff)} smaller)`)
        : chalk.gray(' (same size — metadata was minimal)')

      console.log(chalk.green('✓') + sizeNote)
      passed++
    } catch (err) {
      // dont crash the whole run for one bad file
      console.log(chalk.red('✗ ' + err.message))
      failed++
    }
  }

  console.log()
  console.log(chalk.green.bold('  done!'))
  console.log(chalk.gray(`  ${passed} stripped${failed ? ', ' + failed + ' failed' : ''}`))

  if (opts.output === 'folder') {
    console.log(chalk.gray('  clean files saved to: stripped/'))
  }
  console.log()
}

main().catch(err => {
  // something actually broke — be loud
  console.error(chalk.red.bold('\n  ERROR: ') + err.message)
  if (process.env.DEBUG) console.error(err.stack)
  else console.error(chalk.gray('  run with DEBUG=1 for full stack trace'))
  process.exit(1)
})
