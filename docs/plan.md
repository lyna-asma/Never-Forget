# Phase 1 — Architecture before implementation
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

# Phase 2 — Minimal working application

We'll prove that the basic system works:

Create widget
      ↓
Store widget
      ↓
Load widget
      ↓
Display widget
      ↓
Move widget
      ↓
Restart application
      ↓
Widget is still there

# Phase 3 — Widget management

Then implement:

Add Widget
Edit
Move
Resize
Duplicate
Delete
Delete confirmation
layer selection
widget manager
automatic saving
Ctrl+Z / Ctrl+Y

And the architecture should support:

Task/List Widget
Image Widget
      │
      ▼
Future Widget Types

without us having to rewrite the entire application.

# Phase 4 — Task/List widget

Then we build your actual content system:

Widget
│
├── Text
├── Bullet list
├── Dash list
├── Checkbox
├── Table
└── Image

<small>
Mixed in any order.

Tables:

up to 10 columns
unlimited rows
Small / Medium / Large scale
horizontal scrolling
vertical scrolling

Images:

PNG
SVG
move
resize
</small>

# Phase 5 — Notion integration

Only once the local system works.

We'll implement:

Desktop Widget
       ↕
Node / TypeScript
       ↕
Notion API
       ↕
Specific Notion page region
### Widget ID + Notion Page ID + Region ID

# Phase 6 — Cross-platform testing

Then test the same core application on:

Windows → Linux → macOS

We'll specifically check:

positioning
resizing
transparent widgets
desktop/background behavior
normal windows
always-on-top
multiple monitors
startup
right-click/menu behavior
file paths
keyboard shortcuts

# Phase 7 — Security & robustness

secret management
Notion authentication
API errors
malformed data
filesystem access
input validation
permissions
dependency risks
logging
offline behavior
corrupted local data
network failures

# Phase 8 — Polish

visual styling
animations if you eventually want them
better settings
accessibility
performance
documentation
screenshots/demo
release packaging