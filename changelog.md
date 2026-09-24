---
layout: default
title: Release Notes
description: Release notes for Section Repeat for YouTube version 1.9.29.
image: /assets/images/og-image.png
permalink: /changelog/
---

# Release Notes

## v1.9.29

**Correctness and QA maintenance release.** Product behavior, permissions, host permissions, hotkeys, locale strings, persisted-data schema, and runtime dependencies are unchanged from v1.9.28.

### Reliability & QA

- Unified Chromium selection across browser preflight and real-browser acceptance tooling.
- Hardened validation of committed media and TLS browser-test fixtures.
- Improved live YouTube selector readiness checks to reduce timing-dependent false failures without weakening drift detection.
- Expanded deterministic browser acceptance coverage to all four YouTube hostnames declared in the extension manifest.
- Added regression guards for the shared browser resolver, fixture-validity contract, and host coverage.

The extension remains a Manifest V3 build for Chrome 102+ with YouTube-only host access and the `storage` and `alarms` permissions.

[View Section Repeat for YouTube™ on the Chrome Web Store →]({{ site.store_url }})

[← Back to Home]({{ '/' | relative_url }})
