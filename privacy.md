---
layout: default
prose: true
title: Privacy policy
description: How Section Repeat for YouTube handles your data. Everything stays in your browser.
permalink: /privacy/
---

# Privacy policy

**Last updated:** September 25, 2026  
**Applies to:** Section Repeat for YouTube™ {{ site.version }}

## Overview

Section Repeat for YouTube™ is designed to work without analytics, advertising trackers, a developer-operated backend, or external API calls in the extension runtime. The developer does not collect, sell, or share your personal data, viewing history, or saved section library.

This policy covers the Extension itself. YouTube and Google Chrome are separate Google services governed by their own terms and privacy policies.

## Data stored by the Extension

### Saved sections

The Extension stores the start/end times you create for YouTube videos in `chrome.storage.local`. Video records use a SHA-256-based key derived from the YouTube video ID and a random per-profile salt rather than using the video ID itself as a plain-text storage key.

The Extension also uses `chrome.storage.session` for temporary runtime state. In incognito windows, section persistence and library import/export are disabled; section work remains session-only.

### Random salt

The Extension stores its random salt locally in `chrome.storage.local`. For compatibility with older installations, a profile that has no local salt may read a salt previously stored by an older version in `chrome.storage.sync` and copy it into local storage so existing saved sections remain reachable. The Extension does not write new data to Chrome Sync.

### Import and export

The popup can export the local section library to a JSON file at the user's request. A restorable export contains the random salt and hashed section records required to restore that library. The browser creates the file locally; it is not uploaded to a developer server. Import reads only a file explicitly selected by the user and is accepted only when the destination section library is empty.

## Network activity and tracking

The Extension contains no analytics or advertising trackers and does not send saved section data to the developer. Its runtime contains no `fetch`, XMLHttpRequest, WebSocket, or similar external network client for product data.

The Extension runs only on the supported YouTube and YouTube NoCookie pages declared in its manifest and interacts with the player already loaded in the browser.

## Permissions

The Extension requests:

- **Site access:** YouTube and YouTube NoCookie pages, so the Extension can mark, navigate, and repeat sections in the player.
- **`storage`:** To keep saved sections, local library metadata, and temporary extension state.
- **`alarms`:** To schedule maintenance and recovery work such as storage cleanup and retry tasks.

These permissions are not used for advertising, analytics, or cross-site tracking.

## Storage management

The Extension may remove older local section records when needed to manage extension storage. Storage maintenance occurs inside Chrome extension storage and does not transmit those records to the developer.

## Your controls

You can manage Extension data directly:

- Delete the current section with `X` and undo the most recent delete with `Z`.
- Clear all sections for the current video by pressing `Q` twice.
- Delete sections from the list in the Extension popup.
- Export or import the local section library from the Extension popup.
- Remove the Extension through Chrome to clear its extension data according to Chrome's own storage behavior.

## Security note

Hashing video identifiers reduces casual exposure of readable video IDs in local extension storage, but it is not a claim of anonymity against every possible attacker with access to the local browser profile or an exported library file. Keep exported library files private if they contain information you consider sensitive.

## Third-party services

Your use of Chrome and YouTube remains subject to Google's policies:

- [Google Privacy Policy](https://policies.google.com/privacy)
- [YouTube Terms of Service](https://www.youtube.com/t/terms)

## Changes and contact

This policy may be updated when the Extension's data handling changes. Material changes will be reflected in the date above.

Questions can be sent through the [Section Repeat contact form]({{ site.contact_url }}).
