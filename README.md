# purepic

Strip metadata from photos before sharing. Available on Windows, Mac, Linux, Android, iOS, and Web. (Currently in development stage)

Your photos contain hidden tracking telemetry: GPS coordinates, device info, software footprint, dates, and times. This client-side tool removes all of it before the photo leaves your hands.

---

## platforms

| Platform | Type | Status |
|---|---|---|
| Windows | Desktop GUI + CLI | ✓ (Wine compiled) |
| macOS | Desktop GUI + CLI | ✓ |
| Linux | Desktop GUI + CLI | ✓ (AppImage + deb) |
| Web | HTML5 client-side App | ✓ (Yuki Theme & Glassmorphism) |
| Android | Mobile app outline | ✓ (Mock structure) |
| iOS | Mobile app outline | ✓ (Mock structure) |

---

## project structure

```
purepic/
├── desktop/          ← Electron app (Windows, Mac, Linux)
│   ├── assets/
│   │   └── icon.png      app logo design
│   ├── src/
│   │   ├── cli.js        CLI entry point
│   │   ├── stripper.js   core metadata removal
│   │   └── utils.js      byte formatter, URL helpers
│   └── template/
│       ├── main.js       Electron main process
│       ├── preload.js    context bridge
│       └── index.html    GUI
│
├── web/              ← In-browser static Web App
│   ├── index.html        Glassmorphism UI dashboard
│   ├── app.js            Canvas particle engine & Mascot Yuki dialogue
│   └── mascot.png        Cybersec yuki-chan illustration
│
└── mobile/           ← React Native app outline (Android + iOS)
    ├── App.js            root navigation layout
    ├── AndroidManifest.xml manifest template
    └── src/
        ├── screens/
        │   ├── HomeScreen.js    photo loader UI
        │   └── ResultScreen.js  save/share clean photos
        ├── components/
        │   └── MetaCard.js      metadata tag rendering
        └── utils/
            ├── stripper.js      exif reader + image re-encoder
            └── permissions.js   permission requests handler
```

---

## web app: yuki edition

The web client runs completely client-side. It features:
* **Interactive Yuki Companion**: The cybersecurity mascot *Yuki* responds statefully to your actions, warning you of coordinates found or celebrating a successful metadata purification.
* **Canvas Sakura particles**: Glowing purple and pink cyber-leaves float dynamically in the background, swaying with mouse interaction.
* **Glassmorphism Panels**: A translucent frosted-glass visual design with glowing neon accents.

---

## desktop

### install

```bash
cd desktop
npm install
```

### run

```bash
npm start          # Run CLI utility
npm run gui        # Launch Electron desktop GUI
```

### build installers

We compile desktop packages locally on Linux using `electron-builder` (utilizing Wine for Windows cross-compilation):

```bash
npm run build:linux  # → dist/PurePic-1.0.1.AppImage + purepic-desktop_1.0.1_amd64.deb
npm run build:win    # → dist/PurePic Setup 1.0.1.exe (built via Wine)
```

### CLI usage

```bash
node src/cli.js photo.jpg
node src/cli.js ./photos/
node src/cli.js *.jpg
```

---

## compiled packages

Build assets are packaged under the root `/dist/` folder:
* **Linux AppImage**: `dist/PurePic-1.0.1.AppImage`
* **Linux deb package**: `dist/purepic-desktop_1.0.1_amd64.deb`
* **Windows Installer**: `dist/PurePic_Setup_1.0.1.exe`
* **Web Static ZIP**: `dist/purepic-web-client-1.0.1.zip`

---

## license

MIT
