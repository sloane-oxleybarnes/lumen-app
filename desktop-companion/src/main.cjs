const { app, BrowserWindow, clipboard, globalShortcut, ipcMain, shell } = require("electron");
const path = require("path");

const siteUrl = process.env.BECKETT_SITE_URL || "https://beckett-git-staging-sloane-s-projects1.vercel.app";
let windowRef = null;

function createWindow() {
  windowRef = new BrowserWindow({
    width: 430,
    height: 720,
    minWidth: 360,
    minHeight: 560,
    title: "Beckett Companion",
    backgroundColor: "#faf9f7",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  windowRef.loadFile(path.join(__dirname, "renderer", "index.html"));
  windowRef.on("close", (event) => {
    if (!app.isQuiting) { event.preventDefault(); windowRef.hide(); }
  });
}

function toggleWindow() {
  if (!windowRef) return;
  if (windowRef.isVisible()) windowRef.hide();
  else { windowRef.show(); windowRef.focus(); }
}

app.whenReady().then(() => {
  createWindow();
  globalShortcut.register("CommandOrControl+Shift+B", toggleWindow);
  app.on("activate", () => { if (!windowRef) createWindow(); else windowRef.show(); });
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", (event) => { event.preventDefault(); });

ipcMain.handle("clipboard:read", () => clipboard.readText());
ipcMain.handle("web:open", (_, pathName = "/dashboard/companion") => shell.openExternal(`${siteUrl}${pathName}`));
ipcMain.handle("meeting:start", (_, meeting) => ({
  ok: true,
  session: {
    title: typeof meeting?.title === "string" ? meeting.title.slice(0, 200) : "Meeting",
    platform: meeting?.platform === "zoom" ? "zoom" : "other",
    startedAt: new Date().toISOString(),
  },
}));
