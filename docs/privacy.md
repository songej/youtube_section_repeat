---
layout: default
title: Privacy Policy
permalink: /privacy/
---

# Privacy Policy
- Effective Date: 2025-09-01
- Version: 1.2.6

## Our Promise
- Data collection: None. Data sold/shared: None. Tracking: None.
- On-device by default; YouTube-only; no analytics or tracking; video IDs hashed per user (random salt); a non-identifying salt may be stored in Chrome Sync (sections not synced); supports Incognito (split mode).

## 1. Introduction
This Privacy Policy explains how the “Section Repeat for YouTube™” Chrome extension (the “Extension”) handles your data. Our commitment is simple: your privacy is paramount. The Extension is designed to work entirely on your local device. We do not collect, transmit, or have any access to your personal information.

- What We Mean by "Personal Data": Any information that could identify you, such as your name, email, IP address, or unique device identifiers.
- Scope: This policy covers the Extension only. It does not apply to YouTube or other Google services, which are governed by their own privacy policies.

## 2. Data We Do Not Collect
We are committed to a zero-collection policy. We do not collect, store, sell, or share any of your personal data. This includes, but is not limited to:

- Personal identifiers (e.g., name, email, IP address).
- Your browser history or user activity on any website.
- Your YouTube viewing history.
- Device information, advertising IDs, analytics, or crash reports.

All functionality of the Extension runs completely within your browser. The Extension makes no external network requests, and your data never leaves your computer.

## 3. Data Stored Locally on Your Device
The Extension needs to save some data on your computer to function correctly. This data is stored exclusively on your device using the standard Chrome Storage API and is never sent to us or any third party.

The Extension stores two categories of data:

1. Your Saved Sections (Local to Each Device)
- What it is: The start and end times of the video segments you create.
- Purpose: To remember your sections when you revisit a video.
- Where it's stored: Your computer's local browser storage (`chrome.storage.local`).
- Syncing: This data is **not** synced across your devices.

2. Your Privacy Key (Salt) (Synced Across Your Devices)
- What it is: A single, randomly generated key used to keep your viewing history anonymous. This key itself contains no personal information and cannot be used to identify you.
- Purpose: To protect your privacy while offering convenience across your devices. Instead of saving a video's actual ID (e.g., dQw4w9WgXcQ), we use this key to transform it into an anonymous, irreversible hash (e.g., a1b2c3d4...).
- Think of it this way: The Salt, synced to both your laptop and desktop, allows the extension on each device to independently transform the same video ID into the identical anonymous hash. This means both devices can recognize the video without ever sharing its identity between them or with any server.
- Where it's stored: Your browser's synced storage (chrome.storage.sync).
- Syncing: Only this anonymous key is synced via your Google Account. Your section data and viewing history always remain local to each device and are never synced.

### Storage Management
- Data Retention: Data for a specific video is automatically cleared if it hasn't been accessed for 30 days, or if the total number of saved videos exceeds 3,000.
- Storage Limit: The Extension can use up to 5MB of local storage. You will be notified via a toast message if storage usage exceeds 75%, and a "Purge Old Data" button will appear in the extension popup when usage exceeds 90%.

### Why This Approach?
We deliberately chose this privacy-first architecture. While syncing all your section data across devices might seem convenient, it would require sending your viewing history over the network. Our model—keeping section data local and syncing only the anonymous salt—provides the best of both worlds: a functional multi-device experience where your sensitive viewing data never leaves your computer.

## 4. Permissions and Their Purpose
The Extension requests the minimum permissions required to operate:

- Host (`*://*.youtube.com/*`): Required to add its user interface (like section overlays on the progress bar) and enable keyboard shortcuts directly on the YouTube website. This permission is not used for tracking or reading your activity.
- Storage: Required to use the Chrome Storage API for saving your sections and the privacy key locally on your device.
- Alarms: Required to run periodic maintenance tasks, such as clearing out old, unused section data to manage storage space.

## 5. Your Control Over Your Data
You have full control over the data stored by this Extension.

- To Clear Sections for a Single Video:
1. Navigate to the YouTube video page.
2. Press the `Q` key on your keyboard. This will instantly remove all section data for that video only.

- To Clear Old Data to Free Up Space:
1. When local storage usage exceeds 90%, a "Purge Old Data" button will appear in the extension popup.
2. Clicking this button will safely remove the oldest section data from your storage.

- To Remove All Data and Settings:
1.  Uninstalling the Extension will automatically and permanently remove all of its locally stored data.
2. (Optional) The synced Privacy Key (Salt) can be cleared from your Google Account by navigating to `chrome://sync`. This is an advanced step and typically not necessary, as the key is useless without the extension installed.

## 6. Data Security
Even though your data never leaves your device, we implement measures to protect it locally:

- Hashed Video IDs: To protect your privacy, we do not store YouTube video IDs in a readable format. They are transformed into a non-reversible cryptographic hash using your unique Privacy Key (Salt). This means even someone with access to your computer could not easily determine which videos you have sections for.
- Local-Only Operations: The Extension is built to work offline and makes no external network requests.

## 7. Third-Party Services
We do not share, sell, or disclose your data to any third parties. The Extension operates on the YouTube™ platform and uses Google's Chrome™ Storage API. Your interactions with these services are governed by their respective privacy policies.

- Google Privacy Policy: https://policies.google.com/privacy
- YouTube Terms of Service: https://www.youtube.com/t/terms

## 8. Children’s Privacy
The Extension is intended for a general audience and does not knowingly collect any personal data, making it compliant with the Children's Online Privacy Protection Act (COPPA). We do not direct this extension to children under the age of 13.

## 9. Changes to This Policy
We may update this Privacy Policy from time to time. When we do, we will update the "Effective Date" at the top of this policy and document the changes in the project's official release notes.

## 10. Contact Us
If you have any questions about this Privacy Policy, please contact:
- Name: Eunjeong Song
- Email: songej.dev@gmail.com

> YouTube™ and Chrome™ are trademarks of Google LLC. Use of these trademarks does not imply affiliation or endorsement.

---
[← Back to Home](/)