import type { CapacitorConfig } from "@capacitor/cli";

// Native shell config.
//
// With CAP_SERVER_URL set at `cap sync` time (the CI build sets it to the live
// site), the app opens that site directly — so every website update shows up
// in the installed app straight away, with no reinstall. If the phone is
// offline it shows the bundled offline.html, which retries on its own.
//
// Without it, the React build (in `dist/`) is bundled into the APK and the
// server address is entered on first launch (see the login screen), so one APK
// works for any deployment.
const serverUrl = process.env.CAP_SERVER_URL?.trim().replace(/\/+$/, "");

const config: CapacitorConfig = {
  appId: "com.xyzhostel.hms",
  appName: "XYZ Hostel",
  webDir: "dist",
  android: {
    // API is served over HTTPS, so cleartext (http) is not needed.
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
    ...(serverUrl ? { url: serverUrl, errorPath: "offline.html" } : {}),
  },
};

export default config;
