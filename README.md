# Glyph Studio

Design pictures and animations for the Nothing Phone (3) Glyph Matrix (25 x 25, 489 LEDs), and run them as Glyph Toys.
Design on the phone with your finger, or on a computer with a mouse and keyboard. Everything is saved on the phone.

| Folder | Contents |
|---|---|
| `android/` | The Android app (Kotlin): the phone's server, Glyph Toys, sharing, PC editing |
| `editor/` | The web editor (Svelte + TypeScript); see `editor/README.md` |
| `shared/` | Constants shared by both (matrix mask, format limits) |
| `openspec/` | The plan and task list |

## Getting the Glyph SDK

The app talks to the Glyph Matrix through Nothing's SDK. It is Nothing's software under Nothing's own licence, so it is **not included in this repository**. Download the GlyphMatrix Developer Kit from Nothing's official repository, [Nothing-Developer-Programme/GlyphMatrix-Developer-Kit](https://github.com/Nothing-Developer-Programme/GlyphMatrix-Developer-Kit), read its licence, and put the SDK file at `android/app/libs/glyph-matrix-sdk-2.0.aar` (rename it if it has another name). The build stops with this instruction if the file is missing.

## Build and install

You need Node.js, JDK 17+ (Android Studio's bundled JDK works), the Android SDK and the Glyph SDK file above.

```
cd editor && npm install && npm test        # editor tests
cd android && ./gradlew testDebugUnitTest   # app tests
cd android && ./gradlew assembleDebug       # builds the editor into the app, then the APK
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Editing from a computer ("PC editing")

PC editing is off by default and only works on your own Wi-Fi network.

1. Put the phone and the computer on the **same Wi-Fi**.
2. In the app, open the **⋯** menu on the home screen and choose **Edit from a computer…**, then **Turn on**.
3. On the computer, type the address shown (for example `http://192.168.1.20:8765`) into a browser, or scan the QR code.
4. Enter the 6-digit code shown on the phone. The computer is now paired.
5. Open or create a design. Changes show on the phone straight away, and the other way round.

What to know:

* **The code protects your designs.** Five wrong guesses make a new code. **Disconnect all computers** signs every
  computer out and makes a new code.
* **A notification shows while it is on**, with a **Turn off** button. It also turns itself off after 30 minutes
  without use (an editor that is open on a design counts as use).
* **If the connection drops** (Wi-Fi lost, or PC editing turned off), the editor shows "Disconnected from the phone"
  within about 15 seconds. Everything already saved is safe on the phone. Fix the cause, then press **Reconnect**.
* **The phone's address can change** between sessions if the router hands out a different one. Check the address
  in the dialog each time.
* Only the phone can turn PC editing on or off. A computer cannot.

### Troubleshooting

| Problem | What to try |
|---|---|
| "Turn on" says there is no Wi-Fi | Connect the phone to Wi-Fi first. Mobile data alone has no local address to share. |
| The page does not load on the computer | Check both are on the same network. Use the exact address from the dialog, with `http://` (not `https://`). |
| It works on the phone but not the computer, on a guest or café network | Many routers have **client isolation** (also called AP isolation or guest mode), which blocks devices from talking to each other. Turn it off in the router, use a non-guest network, or use the hotspot workaround below. |
| Public or office Wi-Fi blocks it | Use the hotspot workaround below. |
| A VPN is on | Turn the VPN off on the computer for the session, or allow local network access in its settings. |
| Windows firewall asks about a browser | Not needed: the computer only connects out. Nothing is installed on it. |
| The notification is missing | Allow notifications for Glyph Studio in Android settings. PC editing still works without it, but Android may stop the app sooner. |
| Pairing code rejected | The code changes after five wrong tries or after **Disconnect all**. Read the current one from the phone. |

**Hotspot workaround:** turn on the computer's mobile hotspot (Windows: Settings > Network > Mobile hotspot) or another
phone's hotspot, connect your Nothing phone to it, and turn on PC editing there. A private network with only your two
devices avoids client isolation.

## Sharing designs

Export a design (or all of them) from the app, pick where to send it, and import the `.json` file on another phone or
on the computer. Imported designs always get new ids, so they never overwrite existing ones.

## Releasing

The release APK is signed with a key that lives **outside this project**: `D:\AI Projects\glyph-keys\`
(`glyphstudio-release.jks` plus `keystore.properties` holding its passwords). Nothing in the project folder contains a key or password.

Build the signed, minified APK:

```
cd android
./gradlew :app:assembleRelease        # app/build/outputs/apk/release/app-release.apk
```

If the key is missing the build stops with "Release signing key not found" instead of producing an unsigned file.
To keep the key somewhere else, point `GLYPH_KEYSTORE_PROPERTIES` at a `keystore.properties` with
`storeFile`, `storePassword`, `keyAlias`, `keyPassword`.

**Back the key up.** Copy the whole `glyph-keys` folder to at least one other place (a cloud drive you trust, or a USB stick).
**If the key is lost, an installed copy of the app can never be updated in place**: Android refuses an update signed with a different
key, so you would have to uninstall (which deletes the designs on the phone) and install the new build. Export your designs first if that happens.

Icon: a round LED display in a bezel showing a lit sparkle, with a red lamp. Edit `tools/make_icon.mjs` and run `node tools/make_icon.mjs`; it rewrites the launcher layers (background, foreground, themed) and the editor favicon.

## The library

- Tap a design to open it. **Press and hold** a design (or right-click it on a computer) to start selecting: tap more designs to add or remove them, then use the bar at the bottom. With one design selected you get Toy, Rename, Duplicate, Share and Delete; with several, Share and Delete. Back or Cancel leaves selection.
- Swipe left or right to move between **Designs** and **Templates**. Opening a template only to look at it adds nothing to your designs: it is kept once you change it or set it as a toy.
- The panel at the top shows which design is playing on the back of the phone.

## Look and feel

The interface is called "Dot Instrument": graphite surfaces, one signal red for what is current or primary, a dot-matrix display face (Doto) for titles and numbers, Geist Mono for readouts, icons drawn from a grid of dots, and raised keys that sink when pressed. The matrix is always a dark round display. Colours, type, shape and motion live in `editor/src/tokens.css`; the dot icons are in `editor/src/ui/icons.ts`. Doto and Geist Mono are bundled (SIL Open Font License, see `editor/src/fonts/OFL-NOTICE.txt`) so the app works offline.

## Licence

Glyph Studio is released under the [MIT licence](LICENSE). Nothing's Glyph SDK is not part of it and stays under Nothing's licence. The bundled fonts, Doto and Geist Mono, are under the SIL Open Font Licence (see `editor/src/fonts/OFL-NOTICE.txt`).
