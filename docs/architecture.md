# Never-Forget Architecture

## Desktop Framework

### Decision

Never-Forget will use **Electron** as its desktop framework.

### Why Electron

Electron was tested with a working proof of concept before making the decision.

The POC successfully demonstrated the main window behaviors required by Never-Forget:

* Transparent windows
* Frameless windows
* Dragging widgets from a header area
* Resizing widgets
* Moving a widget programmatically
* Creating multiple independent widget windows
* Changing widget content/title
* Always-on-top behavior
* Styling and transparency
* Hiding widget windows from the taskbar with `skipTaskbar`

Electron also allows the project to remain primarily within the technologies already being learned for the project: JavaScript/TypeScript, HTML, and CSS.

The project is intended to be a learning and portfolio project. Understanding the technologies used by the application is therefore more important than choosing the framework with the lowest possible resource usage.

### Architecture Boundary

Electron will be responsible for desktop-specific behavior such as:

* Creating and managing widget windows
* Window position and size
* Window layers
* Desktop integration
* Communication between the application UI and the operating system

The application logic itself should remain as independent from Electron as reasonably possible.

This separation will make it easier to understand which parts belong to the application and which parts exist only because the application is running as a desktop application.

### Security Boundary

The renderer must not have unrestricted access to Node.js or the operating system.

The current Electron setup uses:

* `contextIsolation: true`
* `nodeIntegration: false`
* A preload script as the controlled bridge between the renderer and Electron

The renderer communicates with the Electron main process through explicitly exposed APIs and IPC.

### Cross-Platform Goal

Never-Forget is intended to support:

* Windows
* Linux
* macOS

The Electron POC was tested on Windows. Linux and macOS behavior still need to be tested later.

Some desktop-specific behavior may differ between operating systems and desktop environments. These differences will be tested during the cross-platform phase rather than assumed to behave identically.

### Current Status

Electron has passed the initial desktop-window POC.

Tauri was considered but will not be used for the current implementation. Introducing Rust would add a significant additional learning curve without solving a current requirement that Electron has failed to satisfy.

The project will therefore continue with Electron.
