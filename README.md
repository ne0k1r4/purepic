# purepic

Strip metadata from photos before sharing. Available on Windows, Mac, Linux, Android, and iOS.

Your photos contain GPS coordinates, device info, date and time, and more. This removes all of it before the photo leaves your hands.

---

## platforms

| Platform | Type | Status |
|---|---|---|
| Windows | Desktop GUI + CLI | ✓ |
| macOS | Desktop GUI + CLI | ✓ |
| Linux | Desktop GUI + CLI | ✓ |
| Android | Mobile app | ✓ |
| iOS | Mobile app | ✓ |

---

## project structure

```
purepic/
├── desktop/          ← Electron app (Windows, Mac, Linux)
│   ├── src/
│   │   ├── cli.js        CLI entry point
│   │   ├── stripper.js   core metadata removal
│   │   └── utils.js      url validation, helpers
│   └── template/
│       ├── main.js       Electron main process
│       ├── preload.js    context bridge
│       └── index.html    GUI
│
└── mobile/           ← React Native app (Android + iOS)
    ├── App.js            root with navigation
    └── src/
        ├── screens/
        │   ├── HomeScreen.js    pick photos, see metadata
        │   └── ResultScreen.js  save or share clean photos
        ├── components/
        │   └── MetaCard.js      metadata tags component
        └── utils/
            ├── stripper.js      exif reader + image re-encoder
            └── permissions.js   Android + iOS permissions
```

---

## desktop

### install

```bash
cd desktop
npm install
```

### run

```bash
npm start          # CLI
npm run gui        # Electron GUI
```

### build installers

```bash
npm run build:win    # → dist/PurePic Setup.exe
npm run build:mac    # → dist/PurePic.dmg
npm run build:linux  # → dist/PurePic.AppImage + .deb + .rpm
```

### CLI usage

```bash
node src/cli.js photo.jpg
node src/cli.js ./photos/
node src/cli.js *.jpg
```

---

## mobile

### requirements

- Node 18+
- React Native CLI
- Android Studio (for Android)
- Xcode 14+ (for iOS, Mac only)

### install

```bash
cd mobile
npm install
npx pod-install    # iOS only
```

### run

```bash
npm run android    # run on Android device/emulator
npm run ios        # run on iOS simulator (Mac only)
```

### build

```bash
# Android APK
cd mobile/android && ./gradlew assembleRelease
# → mobile/android/app/build/outputs/apk/release/app-release.apk

# iOS IPA (Mac only)
cd mobile && npx react-native build-ios --mode Release
```

---

## what gets removed

- GPS location (latitude, longitude, altitude)
- Device make and model
- Software used (Lightroom, Photoshop, GIMP...)
- Date and time photo was taken
- Author and copyright info
- ICC color profiles
- IPTC and XMP data
- Embedded thumbnails

---

## tips

- Desktop: use the stripped/ folder output mode — safest, keeps originals untouched
- Mobile: photos save to Pictures/purepic on Android, Camera Roll on iOS
- GPS tag shown in red — most dangerous, reveals your location
- Run desktop CLI with DEBUG=1 if something breaks

---

## license

MIT






