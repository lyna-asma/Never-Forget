
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const appWindow = getCurrentWindow();

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="widget">
    <div class="header" data-tauri-drag-region>
      <strong>Never-Forget POC</strong>
    </div>

    <p>Desktop widget window test</p>

    <div class="controls">
      <button id="top">Toggle always on top</button>
      <button id="move">Move window</button>
      <button id="new">Create widget</button>
    </div>
  </div>
`;

// Toggle whether this widget stays above normal application windows.
document.querySelector("#top")?.addEventListener("click", async () => {
  const isOnTop = await appWindow.isAlwaysOnTop();
  await appWindow.setAlwaysOnTop(!isOnTop);
});

// Move the current window to a known screen position.
// LogicalPosition is the Tauri type expected by setPosition().
document.querySelector("#move")?.addEventListener("click", async () => {
  await appWindow.setPosition(new LogicalPosition(100, 100));
});

// Create another independent widget window.
document.querySelector("#new")?.addEventListener("click", () => {
  const label = `widget-${Date.now()}`;

  new WebviewWindow(label, {
    url: "/",
    title: "Never-Forget Widget",
    width: 300,
    height: 220,
    transparent: true,
    decorations: false,
    resizable: true,
    alwaysOnTop: false,
  });
});

