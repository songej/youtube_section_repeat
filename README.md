# Section Repeat for YouTube™

[Privacy](https://sectionrepeat.com/privacy) · [Changelog](https://sectionrepeat.com/changelog)

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-blue.svg)](https://github.com/songej/youtube_section_repeat/blob/main/LICENSE) [![Release Version](https://img.shields.io/badge/version-v1.2.6-green.svg)](https://github.com/songej/youtube_section_repeat/releases) [![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-v1.2.6-blue.svg?logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/section-repeat-for-youtub/pppgnfkfeciopablcbkjdohiknebahkc)

> Project Status: 🟢 Active | Type: 🧩 Chrome Browser Extension

## 1. Overview

**The ultimate tool for musicians, dancers, language learners, and anyone who needs to master specific parts of a video.**

Section Repeat for YouTube™ is a browser extension engineered to enhance practice and learning efficiency on the YouTube platform. It provides a keyboard-driven interface for slicing and repeating of video segments. It enables A-B repeat style practice by looping user-defined clips, prioritizing a streamlined, mouse-free experience for music, dance, and language learning.

---

## 2. Core Principles

This extension is built on three core principles:

-   🔒 **Privacy First**: We do not collect, store, or share any of your personal data. Everything happens on your computer, and we have no access to your viewing history or activity.
-   ⚡️ **Performance-Oriented**: Built with modern Manifest V3 standards and VanillaJS, the extension is designed for minimal impact on browser resources. It is lightweight and fast, with no external frameworks.
-   ⌨️ **Keyboard-Centric**: All core functions are designed to be controlled entirely without a mouse, allowing you to stay focused on your practice without interrupting your workflow.

---

## 3. Key Features

-   **Precision Slicing**: Define multiple, high-precision video sections with a single key press.
-   **Keyboard-Centric Workflow**: All core functions are mapped to intuitive hotkeys (`S`, `E`, `R`, `A`, `D`, `Q`, `1-9`) for maximum efficiency.
-   **Seamless Navigation & Repeat**: Instantly navigate sections with `A`/`D` and toggle repeat mode with `R`.
-   **Auto-Looping**: When a video with defined sections ends, repeat mode automatically starts from the first section.
-   **Focus Mode**: A dedicated "Focus Mode" (`W` key) reloads a video from a playlist into a standalone player, preventing auto-play from interrupting your repeat sessions.
-   **Direct Section Access**: Instantly jump to the first nine sections using the number keys `1-9`.
-   **Intelligent Error Prevention**: Incomplete sections are automatically completed if long enough or discarded if too short, ensuring a seamless transition into repeat mode.

---

## 4. Getting Started

### Installation

**1. From the Chrome Web Store (Recommended)**
-   [Install Here](https://chromewebstore.google.com/detail/section-repeat-for-youtub/pppgnfkfeciopablcbkjdohiknebahkc)

**2. Manual Installation (for Developers)**
<details>
<summary>Click to view installation instructions</summary>

1.  Clone this repository or download and unzip the source code.
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable "Developer mode" in the top-right corner.
4.  Click "Load unpacked" and select the project's root directory.
</details>

### Quick Start

1. **Make a section**: Press `S` to start, `E` to end.
2. **Chain sections**: Press `E` again to add the next section.
3. **Repeat & Navigate**: Press `R` to repeat. Press `A` or `D` to jump between sections.

### Basic Usage

| Key   | Action                   | Description                                                                  |
| :---- | :----------------------- | :--------------------------------------------------------------------------- |
| **S** | **Start section** | Sets the start-time for a new section.                                     |
| **E** | **End (Chain) section** | Completes the current section. Press again to start the next section where the last one ended (chaining). |
| --- | --- | --- |
| **R** | **Toggle Repeat** | Starts or stops repeating through the defined sections.                    |
| **Q** | **Clear all sections** | Deactivates all extension functions and clears all sections for the current video. |
| **W** | **Enter Focus Mode** | In a playlist, reloads the video in a standalone view to prevent auto-advancing. |
| --- | --- | --- |
| **A/D** | **Previous / Next section** | Moves to the previous (`A`) or next (`D`) section and begins repeating automatically. |
| **1-9** | **Jump to section** | Instantly jumps to a specific section (1 through 9).                       |

---

## 5. Technical Architecture

-   **Core Logic**: Vanilla JavaScript, compliant with the Manifest V3 standard.
-   **State Management**: The background service worker (`background.js`) manages tab states and global settings, using `chrome.storage.session` for non-persistent data and `chrome.storage.sync` for user preferences.
-   **DOM Interaction**: A single, unified `MutationObserver` monitors the YouTube player, with debouncing and filtering to minimize performance impact. DOM lookups are optimized via an `LRUCache`.
-   **UI Components**: Toasts and overlays render in isolated Shadow DOM trees to prevent style conflicts with the host page.
-   **Security**: Locally stored video IDs are hashed with a device-specific salt using the `SubtleCrypto` API. The extension makes no external network requests.

---

## 6. Technical Specifications

-   **Section & Storage Limits**:
    -   Max Sections per Video: 50
    -   Min Section Duration: 0.5 seconds
    -   Data Expiration: Sections unused for 30+ days are subject to cleanup.
    -   Max Total Keys: 3,000
    -   Storage Quota: 5MB (`chrome.storage.local`)
-   **Storage Cleanup**:
    -   **Automatic Purge**: Runs every 60 minutes to clear expired data.
    -   **User Notifications**: A toast notification is shown when storage usage exceeds 75%, and a manual cleanup button appears in the popup when usage exceeds 90%.

---

## 7. Project Information

-   **Author**: Eunjeong Song ([Homepage](https://songej.com) / [LinkedIn](https://www.linkedin.com/in/songej))
-   **Source Code**: https://github.com/songej/youtube_section_repeat
-   **Privacy & Legal**:
    -   **Privacy Policy**: [Read our Privacy Policy](https://sectionrepeat.com/privacy)
    -   **Changelog**: [View release notes](https://sectionrepeat.com/changelog)
    -   **License**: This project is licensed under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/). This software may be used, copied, modified, and distributed for noncommercial purposes only.
    -   **Disclaimer**: Section Repeat for YouTube™ is an independent project and is not officially associated with YouTube or Google LLC. "YouTube" is a trademark of Google LLC.
-   **Acknowledgements**: Icon by [khulqi Rosyid](https://www.iconfinder.com/khulqi-rosyid) from IconFinder ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
