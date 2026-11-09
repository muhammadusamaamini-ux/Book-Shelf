# Book Shelf

A personal reader for **PDF, EPUB, Word, Excel and PowerPoint** files, for Windows and Android. It works offline.

## Download

Open **[Releases](https://github.com/muhammadusamaamini-ux/book-shelf/releases/latest)** and download:

- **Windows:** `Book-Shelf-Setup-<version>.exe`
- **Android:** `Book-Shelf-<version>.apk`

After the first install, use **⋯ → Check for updates** inside the app. You never need to come back here for updates.

## What it does

- Bookshelf, sorted by what you read last
- EPUB reader: text size, text width, fonts, themes, continuous scroll, Urdu and Pashto support
- PDF reader: zoom, night mode, outline, search, bookmarks
- Highlights, notes, drawings, text boxes, shapes and signatures, synced between a PDF and its EPUB version
- "You stopped here" marker and read aloud with sentence highlighting
- Offline English dictionary (Open English WordNet)
- PDF tools: organise pages, merge, split, compress, watermark, page numbers, forms, pictures to PDF, PDF to Word, text or pictures, PDF to EPUB
- Word, Excel and PowerPoint: view, present, and edit Word and Excel files
- Opens files from **Open with** on Windows and Android
- Optional sync between devices through a private GitHub repository

## How it is built

Every push to `main` runs `.github/workflows/build.yml`. It builds the Windows installer (Electron) and the Android APK (Capacitor), then publishes both as a new Release. The apps check that Release for updates.

- `www/index.html`: the app
- `www/dict/`: offline dictionary data
- `electron/`: Windows app shell
- `android-native/`, `scripts/patch-android.js`: Android "Open with", file saving and self-update
- `scripts/vendor.js`: copies the reading libraries and fonts into the app during the build

## Credits

Dictionary: [Open English WordNet 2024](https://github.com/globalwordnet/english-wordnet), CC BY 4.0. PDF.js, pdf-lib, JSZip, SheetJS, mammoth and docx-preview are used under their own licences.
