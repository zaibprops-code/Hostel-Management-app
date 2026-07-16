import type { CapacitorConfig } from "@capacitor/cli";

// Native shell config. The React build (in `dist/`) is bundled into the APK and
// talks to your hosted backend API. The server address is entered by the user on
// first launch (see the login screen), so one APK works for any deployment.
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
  },
};

export default config;
