```
                Desktop Widget App
                       │
          ┌────────────┴────────────┐
          │                         │
   Cross-platform core        OS integration
          │                  ┌──────┼──────┐
          │                  │      │      │
      TypeScript           Win    Linux   macOS
          │
   ┌──────┼──────────┐
   │      │          │
Storage  Widgets   Notion
```

```
src/
├── main/
│   └── main.js
│
├── preload/
│   └── preload.js
│
└── renderer/
    ├── index.html
    ├── style.css
    └── renderer.js
```

```
┌──────────────────────────┐
│ Renderer                 │
│ HTML / CSS / JS          │
│                          │
│ "I want to move myself"  │
└────────────┬─────────────┘
             │
             │ widgetAPI.moveWindow()
             ▼
┌──────────────────────────┐
│ Preload                  │
│                          │
│ Controlled bridge        │
└────────────┬─────────────┘
             │
             │ IPC message
             ▼
┌──────────────────────────┐
│ Main process             │
│                          │
│ Electron / OS access     │
└──────────────────────────┘
```