# Never-Forget GitHub project setup
# This script creates the basic GitHub structure for the project.
# It is safe to run again if something already exists.

$ErrorActionPreference = "Stop"

# ------------------------------------------------------------
# Project information
# ------------------------------------------------------------

$Repo = "lyna-asma/Never-Forget"

Write-Host ""
Write-Host "Setting up GitHub for $Repo..." -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------
# Labels
# ------------------------------------------------------------

$Labels = @(
    @{ Name = "feature";        Color = "1D76DB"; Description = "A new user-facing or project capability" },
    @{ Name = "bug";            Color = "D73A4A"; Description = "Something is not working as expected" },
    @{ Name = "architecture";   Color = "5319E7"; Description = "Architecture or technical design work" },
    @{ Name = "security";       Color = "B60205"; Description = "Security-related work" },
    @{ Name = "documentation";  Color = "0075CA"; Description = "Documentation or project explanation" },
    @{ Name = "cross-platform"; Color = "006B75"; Description = "Windows, Linux, or macOS compatibility" },
    @{ Name = "notion";         Color = "000000"; Description = "Notion integration or synchronization" },
    @{ Name = "learning";       Color = "FBCA04"; Description = "Work primarily intended to understand a concept" },
    @{ Name = "priority:high";  Color = "B60205"; Description = "Important for the current project phase" },
    @{ Name = "priority:low";   Color = "C5DEF5"; Description = "Useful but not currently important" }
)

Write-Host "Creating labels..." -ForegroundColor Yellow

foreach ($Label in $Labels) {
    $Existing = gh label list --repo $Repo --search $Label.Name --limit 100 --json name |
        ConvertFrom-Json

    $AlreadyExists = $Existing | Where-Object { $_.name -eq $Label.Name }

    if ($AlreadyExists) {
        Write-Host "  [exists] $($Label.Name)"
    }
    else {
        gh label create $Label.Name `
            --repo $Repo `
            --color $Label.Color `
            --description $Label.Description

        Write-Host "  [created] $($Label.Name)"
    }
}

# ------------------------------------------------------------
# Milestones
# ------------------------------------------------------------

$Milestones = @(
    "Project Foundation",
    "Architecture",
    "Core Widget System",
    "Task & Image Widgets",
    "Notion Integration",
    "Cross-Platform Support",
    "Security & Hardening",
    "Release"
)

Write-Host ""
Write-Host "Creating milestones..." -ForegroundColor Yellow

$ExistingMilestones = gh api "repos/$Repo/milestones?state=all&per_page=100" |
    ConvertFrom-Json

foreach ($Milestone in $Milestones) {
    $AlreadyExists = $ExistingMilestones |
        Where-Object { $_.title -eq $Milestone }

    if ($AlreadyExists) {
        Write-Host "  [exists] $Milestone"
    }
    else {
        gh api "repos/$Repo/milestones" `
            -f title="$Milestone" `
            -f state="open" | Out-Null

        Write-Host "  [created] $Milestone"
    }
}

# ------------------------------------------------------------
# Initial roadmap issues
# ------------------------------------------------------------

$Issues = @(
    @{
        Title = "Define cross-platform application architecture"
        Body = @"
## Goal

Define how Never-Forget will work across Windows, Linux, and macOS.

## Questions to answer

- What belongs in the cross-platform core?
- What requires OS-specific code?
- Should the desktop layer use Tauri, Electron, or another approach?
- How will desktop/background, normal, and always-on-top layers work?
- How will multiple monitors be handled?
- How will startup and window positioning work?

## Acceptance criteria

- Architecture is documented in `docs/`.
- Cross-platform and OS-specific responsibilities are clearly separated.
- The chosen desktop framework is justified.
- No application implementation begins before this architecture is understood.
"@
        Labels = @("architecture", "cross-platform", "learning")
        Milestone = "Architecture"
    },

    @{
        Title = "Build minimal persistent widget"
        Body = @"
## Goal

Create the smallest complete widget workflow.

The application should be able to:

1. Create a widget.
2. Store its data.
3. Display it.
4. Move it.
5. Close the application.
6. Restart the application.
7. Restore the widget in its previous position.

## Acceptance criteria

- Widget data persists between launches.
- Position persists between launches.
- The data flow is documented in simple terms.
- The implementation is small enough to understand completely.
"@
        Labels = @("feature", "learning")
        Milestone = "Core Widget System"
    },

    @{
        Title = "Implement widget management"
        Body = @"
## Goal

Add the main widget-management interactions.

## Required behavior

- Add widget
- Edit widget
- Move widget
- Resize widget
- Duplicate widget
- Delete widget
- Delete confirmation
- Desktop / Normal / Always-on-top layer
- Widget manager window
- Automatic saving
- Ctrl+Z undo
- Ctrl+Y redo
- Clicking outside edit mode exits editing and saves

## Acceptance criteria

Each operation works independently and widget state remains persistent after restarting.
"@
        Labels = @("feature", "learning")
        Milestone = "Core Widget System"
    },

    @{
        Title = "Implement Task/List widget"
        Body = @"
## Goal

Create the main Task/List widget.

## Content blocks

- Text/note
- Bullet list
- Dash list
- Checkbox/checklist
- Table
- Image

Blocks can appear in different orders inside the same widget.

## Tables

- Up to 10 columns
- Unlimited rows
- Small / Medium / Large scale
- Horizontal and vertical scrolling when necessary

## Images

- PNG and SVG
- Moveable
- Resizable

## Acceptance criteria

The widget can contain mixed content and all content persists correctly.
"@
        Labels = @("feature", "learning")
        Milestone = "Task & Image Widgets"
    },

    @{
        Title = "Implement decorative Image widget"
        Body = @"
## Goal

Create a standalone decorative image widget.

## Requirements

- PNG and SVG
- Move
- Resize
- Delete
- Transparent/non-card presentation
- Desktop/background layer by default

The image should behave like part of the desktop rather than a normal application window.
"@
        Labels = @("feature", "cross-platform")
        Milestone = "Task & Image Widgets"
    },

    @{
        Title = "Implement Notion region synchronization"
        Body = @"
## Goal

Allow a Task/List widget to synchronize with a specific marked region of a Notion page.

## Requirements

- Widget ID
- Notion Page ID
- Region ID
- Two-way synchronization
- Only the marked region is read or modified
- Do not rewrite unrelated Notion page content
- Page title shown in the widget header
- Page title changes reflected after synchronization
- Timestamp-based last-modification-wins conflict handling
- If the Notion region disappears, keep the widget and mark it disconnected
- Duplicating a linked widget creates a new region immediately below the original

## Security

- Never commit Notion tokens.
- Store secrets outside the repository.
- Validate data received from Notion.
"@
        Labels = @("feature", "notion", "security")
        Milestone = "Notion Integration"
    },

    @{
        Title = "Test Windows Linux and macOS behavior"
        Body = @"
## Goal

Verify that the application behaves correctly on all three target operating systems.

## Test areas

- Desktop/background behavior
- Normal window behavior
- Always-on-top behavior
- Transparent windows
- Widget positioning
- Multiple monitors
- Startup
- Keyboard shortcuts
- File paths
- Window resizing
- Right-click/context-menu behavior

Document platform-specific limitations instead of hiding them.
"@
        Labels = @("cross-platform", "bug", "learning")
        Milestone = "Cross-Platform Support"
    },

    @{
        Title = "Perform security and robustness review"
        Body = @"
## Goal

Review the application from a security and reliability perspective.

## Review areas

- Secrets and environment variables
- Notion authentication
- Input validation
- Filesystem access
- Network failures
- Malformed data
- Corrupted local data
- Dependency security
- Error handling
- Logging
- Offline behavior
- Trust boundaries between the application and external data

Document important security decisions in simple language.
"@
        Labels = @("security", "architecture", "learning")
        Milestone = "Security & Hardening"
    },

    @{
        Title = "Prepare first release"
        Body = @"
## Goal

Prepare Never-Forget for an initial usable release.

## Tasks

- Final documentation
- Installation instructions
- Configuration instructions
- Screenshots
- Accessibility review
- Performance review
- Packaging for Windows
- Packaging for Linux
- Packaging for macOS

Animations and additional visual polish can be considered here rather than complicating the early architecture.
"@
        Labels = @("feature", "documentation", "cross-platform")
        Milestone = "Release"
    }
)

Write-Host ""
Write-Host "Creating roadmap issues..." -ForegroundColor Yellow

$ExistingIssues = gh issue list `
    --repo $Repo `
    --state all `
    --limit 100 `
    --json number,title |
    ConvertFrom-Json

foreach ($Issue in $Issues) {
    $AlreadyExists = $ExistingIssues |
        Where-Object { $_.title -eq $Issue.Title }

    if ($AlreadyExists) {
        Write-Host "  [exists] $($Issue.Title)"
        continue
    }

    $LabelArguments = @()

    foreach ($Label in $Issue.Labels) {
        $LabelArguments += "--label"
        $LabelArguments += $Label
    }

    gh issue create `
        --repo $Repo `
        --title $Issue.Title `
        --body $Issue.Body `
        --milestone $Issue.Milestone `
        @LabelArguments

    Write-Host "  [created] $($Issue.Title)"
}

Write-Host ""
Write-Host "GitHub setup complete." -ForegroundColor Green
Write-Host ""
Write-Host "Review the repository on GitHub before starting implementation."