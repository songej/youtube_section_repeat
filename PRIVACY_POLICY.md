# Privacy Policy

- Effective Date: 2025-08-18
- Version: 1.2.2

Our Promise: We do not collect, store, or share any of your personal data. Everything happens on your computer.

## 1. Introduction
This Privacy Policy explains how the “Section Repeat for YouTube™” Chrome extension (the “Extension”) handles your data. Our commitment is simple: your privacy is paramount. The Extension is designed to work entirely on your local device. We do not collect, transmit, or have any access to your personal information.

-   What We Mean by "Personal Data": Any information that could identify you, such as your name, email, IP address, or unique device identifiers.
-   Scope: This policy covers the Extension only. It does not apply to YouTube or other Google services, which are governed by their own privacy policies.

## 2. Data We Do Not Collect
We are committed to a zero-collection policy. We do not collect, store, sell, or share any of your personal data. This includes, but is not limited to:

-   Personal identifiers (e.g., name, email, IP address).
-   Your Browse history or user activity on any website.
-   Your YouTube viewing history.
-   Device information, advertising IDs, analytics, or crash reports.

All functionality of the Extension runs completely within your browser. We have no server, and your data never leaves your computer.

## 3. Data Stored Locally on Your Device
The Extension needs to save some data on your computer to function correctly. This data is stored exclusively on your device using the standard Chrome Storage API and is never sent to us or any third party.

The Extension stores two categories of data:

1.  Your Saved Sections (Local to Each Device)
    -   What it is: The start and end times of the video segments you create.
    -   Purpose: To remember your sections when you revisit a video.
    -   Where it's stored: Your computer's local browser storage (`chrome.storage.local`).
    -   Syncing: This data is not synced across your devices. Sections you create on one computer will only be available on that computer.

2.  Privacy Protection Key (Synced Across Your Devices)
    -   What it is: A randomly generated, unique security key (technically known as a "salt").
    -   Purpose: To protect your privacy by hashing (anonymizing) video IDs before they are stored. This key itself does not contain any personal information. 
    -   Where it's stored: Your browser's synced storage (`chrome.storage.sync`).
    -   Syncing: This key is synced with your Google Account. This ensures that if you use the Extension on another device, it can recognize the same video without revealing the video's actual ID. Your section data itself remains local as a deliberate privacy choice, ensuring your viewing habits are never synced or stored outside of the device where you create them.

### Storage Management
-   Data Retention: Data for a specific video is automatically cleared if it hasn't been accessed for 30 days, or if the total number of saved videos exceeds 3,000.
-   Storage Limit: The Extension can use up to 5MB of local storage. You will be notified in the extension popup if storage usage gets high (over 90%), with an option to clean up old data.

## 4. Permissions and Their Purpose
The Extension requests the minimum permissions required to operate:

-   Host (`*://*.youtube.com/*`): Required to add its user interface (like section overlays on the progress bar) and enable keyboard shortcuts directly on the YouTube website. This permission is not used for tracking or reading your activity.
-   Storage: Required to use the Chrome Storage API for saving your sections and the privacy key locally on your device.
-   Alarms: Required to run periodic maintenance tasks, such as clearing out old, unused section data to manage storage space.

## 5. Your Control Over Your Data
You have full control over the data stored by this Extension.

-   To Clear Sections for a Single Video:
    1.  Navigate to the YouTube video page.
    2.  Press the `Q` key on your keyboard. This will instantly remove all section data for that video only.

-   To Clear Old Data to Free Up Space:
    1.  When local storage usage exceeds 90%, a "Purge Old Data" button will appear in the extension popup.
    2.  Clicking this button will safely remove the oldest section data from your storage.

-   To Remove All Data and Settings:
    1.  Uninstalling the Extension will automatically and permanently remove all of its locally stored data. (This is the only step needed for most users. The synced privacy key will no longer have any effect.)
    2.  The synced privacy key can be cleared from your Google Account by navigating to `chrome://sync`, but this is an advanced step and typically not necessary.

## 6. Data Security
Even though your data never leaves your device, we implement measures to protect it locally:
-   Hashed Video IDs: To protect your privacy, we do not store YouTube video IDs in a readable format. Instead, they are transformed into a non-reversible cryptographic hash using your unique, randomly generated privacy key. This means that even if someone gained access to your computer's storage, they could not easily determine which videos you have been watching.
-   Local-Only Operations: The Extension is built to work offline and makes no external network requests.

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
