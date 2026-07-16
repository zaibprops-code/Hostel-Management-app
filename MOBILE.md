# 📱 Android App (APK)

The web app is wrapped into a **real native Android app** using
[Capacitor](https://capacitorjs.com). The React UI is bundled inside the APK and talks to
your hosted backend API. On first launch the app asks for your **server address** and
remembers it — so **one APK works for any deployment**, and you can share it with anyone.

> ⚠️ The app needs your backend to be online to work. Deploy it first (see
> [DEPLOYMENT.md](DEPLOYMENT.md)) — you'll get an API address like
> `https://hostel-api.onrender.com` to enter on first launch.

---

## Getting the APK (no computer setup needed)

The APK is built automatically by GitHub — you don't need Android Studio or a build machine.

1. Open your repository on **GitHub** → **Actions** tab.
2. Click **"Build Android APK"** in the left list → **"Run workflow"** → **Run workflow**.
3. Wait ~5 minutes for the green tick.
4. Get the APK in either of two ways:
   - **For yourself:** open the finished run → download **`hostel-app-apk`** (a zip
     containing `app-debug.apk`).
   - **To share with others (public link, no login needed):** go to the repo's
     **Releases** → **Latest Android APK** → download **`app-debug.apk`**. Send that link
     to anyone; they can install it directly.

---

## Installing on a phone

1. Copy `app-debug.apk` to the Android phone (or open the Releases link on the phone).
2. Tap the file. Android may warn about installing from an unknown source — allow it for
   your browser/files app.
3. Open **XYZ Hostel** from the app drawer.
4. On first launch, enter your **server address** (e.g. `hostel-api.onrender.com`) and tap
   **Save & continue**, then log in.

You can change the server later from the ⚙ **Server settings** link on the login screen.

---

## Building the APK yourself (optional, needs Android Studio)

If you'd rather build locally instead of via GitHub:

```bash
# one-time: install Node deps
npm install

# build the web bundle and sync it into the native project
npm --workspace web run build
cd web && npx cap sync android

# open in Android Studio to build/run, OR build from the command line:
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Requires **JDK 17** and the **Android SDK** (Android Studio installs both).
Open the project in Android Studio with: `cd web && npx cap open android`.

---

## Publishing to the Google Play Store (later)

The debug APK above is perfect for installing directly and sharing internally. For the Play
Store you'll additionally need to:

1. Create a **signing keystore** and build a signed **release bundle** (`./gradlew bundleRelease`).
2. Add an **app icon & splash screen** (`@capacitor/assets` generates them from one image).
3. Register a **Google Play Developer** account (one-time $25) and upload the `.aab`.

The project is already structured for this (`appId: com.xyzhostel.hms`); it's purely
additional configuration, not a rewrite.

---

## App details

| | |
|---|---|
| App name | XYZ Hostel |
| Package / App ID | `com.xyzhostel.hms` |
| Min Android version | 5.1 (API 22) |
| Target Android version | 14 (API 34) |
| Framework | Capacitor 6 (native shell) + React |
