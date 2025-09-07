---
layout: default
title: A-B repeat and multi-section loops for YouTube.
description: A-B repeat and multi-section loops for YouTube. Practice faster with keyboard shortcuts.
image: /assets/images/og-image.webp
permalink: /
---

# Section Repeat for YouTube™

## 1. Overview

The ultimate tool for musicians, dancers, language learners, and anyone who needs to master specific parts of a video.

[Install for Chrome →](https://chromewebstore.google.com/detail/pppgnfkfeciopablcbkjdohiknebahkc)

Section Repeat for YouTube™ is a browser extension engineered to enhance practice and learning efficiency on the YouTube platform. It provides a keyboard-driven interface for slicing and repeating of video segments. It enables A-B repeat style practice by looping user-defined clips, prioritizing a streamlined, mouse-free experience for music, dance, and language learning.

## 2. Core Principles

This extension is built on three core principles:

- 🔒 Privacy First: We do not collect, store, or share any of your personal data. Everything happens on your computer, and we have no access to your viewing history or activity.
- ⚡️ Performance-Oriented: Built with modern Manifest V3 standards and VanillaJS, the extension is designed for minimal impact on browser resources. It is lightweight and fast, with no external frameworks.
- ⌨️ Keyboard-Centric: All core functions are designed to be controlled entirely without a mouse, allowing you to stay focused on your practice without interrupting your workflow.

### 3. Key Features

- 🎯 Precision Slicing: Define multiple, high-precision video sections with a single key press.
- ⌨️ Keyboard-Centric Workflow: All core functions are mapped to intuitive shortcuts for maximum efficiency, allowing you to maintain your workflow without a mouse.
- 🔁 Seamless Navigation & Repeat: Instantly navigate between sections and toggle repeat mode with simple key presses.
- ✨ Intelligent Automation:
  - Auto-Looping: When a video with defined sections ends, repeat mode automatically starts from the first section.
  - Focus Mode: A dedicated shortcut reloads a video from a playlist into a standalone player, preventing auto-play from interrupting your practice sessions.
  - Error Prevention: Incomplete sections are automatically completed or discarded, ensuring a seamless transition into repeat mode without data errors.

## 4. Getting Started

### Installation

1. From the Chrome Web Store (Recommended)
- [Install Here](https://chromewebstore.google.com/detail/section-repeat-for-youtub/pppgnfkfeciopablcbkjdohiknebahkc)

2. Manual Installation (for Developers)
<details>
<summary>Click to view installation instructions</summary>

1. Clone this repository or download and unzip the source code.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable "Developer mode" in the top-right corner.
4. Click "Load unpacked" and select the project's root directory.
</details>

### Quick Start

1. Make a section: press `S` to start and `E` to end.
2. Chain sections: press `E` again to add the next section.
3. Repeat & Navigate: press `R` to toggle repeat; press `A` or `D` to move between sections.

### 4. Shortcuts

All core functions of the extension are controlled by the shortcuts below.

| Key | Action | Description |
| :--- | :--- | :--- |
| S | Start section | Sets the start-time for a new section. |
| E | End section | Completes the current section. Press again to start the next section where the last one ended. |
| R | Toggle Repeat | Starts or stops repeating through the defined sections. |
| A / D | Previous / Next section | Moves to the previous (`A`) or next (`D`) section and begins repeating automatically. |
| 1-9 | Jump to section | Instantly jumps to a specific section (1 through 9). |
| W | Enter Focus Mode | In a playlist, reloads the video in a standalone view to prevent auto-advancing. |
| Q | Clear all sections | Deactivates all extension functions and clears all sections for the current video. |

## 5. Technical Architecture

- Core Logic: Vanilla JavaScript, compliant with the Manifest V3 standard.
- State Management: `chrome.storage.session` is used for temporary data that is cleared when a tab is closed, while `chrome.storage.sync` is used for a privacy-protecting security key (salt). Section data itself is stored in `chrome.storage.local`.
- DOM Interaction: A single, unified `MutationObserver` monitors the YouTube player, with debouncing and filtering to minimize performance impact. DOM lookups are optimized via an `LRUCache`.
- UI Components: Toasts and overlays render in isolated Shadow DOM trees to prevent style conflicts with the host page.
- Security: Locally stored video IDs are hashed with a user-specific salt using the `SubtleCrypto` API. The extension makes no external network requests.

## 6. Technical Specifications

- Section & Storage Limits:
  - Max Sections per Video: 50
  - Min Section Duration: 0.5 seconds
  - Data Expiration: Sections unused for 30+ days are subject to cleanup.
  - Max Total Keys: 3,000
  - Storage Quota: 5MB (`chrome.storage.local`)
- Storage Cleanup:
  - Automatic Purge: Runs every 60 minutes to clear expired data.
  - User Notifications: A toast notification is shown when storage usage exceeds 75%, and a manual cleanup button appears in the popup when usage exceeds 90%.

## 7. Project Information

- Author: Eunjeong Song ([Homepage](https://songej.com) / [LinkedIn](https://www.linkedin.com/in/songej))
- Source Code: [GitHub Repository](https://github.com/songej/youtube_section_repeat)
- Privacy & Legal:
  - Privacy Policy: [Read our Privacy Policy](https://sectionrepeat.com/privacy)
  - Changelog: [View release notes](https://sectionrepeat.com/changelog)
  - License: This project is licensed under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/). This means the software may be freely used, copied, modified, and distributed for noncommercial purposes only. For commercial use, please contact the author.
  - Disclaimer: Section Repeat for YouTube™ is an independent project and is not officially associated with YouTube or Google LLC. "YouTube" is a trademark of Google LLC.
- Acknowledgements: Icon by [khulqi Rosyid](https://www.iconfinder.com/iconfinder/khulqi-rosyid) from IconFinder ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).