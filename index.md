---
layout: default
title: Section Repeat for YouTube™
description: Keyboard-first A-B repeat and multi-section looping for focused YouTube practice.
image: /assets/images/og-image.png
permalink: /
---

<section class="hero">
  <div class="hero-copy">
    <p class="eyebrow">Chrome extension · v{{ site.version }} · Manifest V3</p>
    <div class="hero-title-row">
      <img class="product-icon" src="{{ '/assets/images/apple-touch-icon.png' | relative_url }}" alt="" width="88" height="88">
      <h1>Section Repeat for YouTube™</h1>
    </div>
    <p class="hero-lead">Create A–B repeats, chain multiple sections, and move through them from the keyboard—built for focused practice on YouTube.</p>
    <div class="hero-actions">
      <a class="button button-primary" href="{{ site.store_url }}" target="_blank" rel="noopener noreferrer">Chrome Web Store →</a>
      <a class="button button-secondary" href="{{ '/privacy/' | relative_url }}">Privacy</a>
    </div>
  </div>
  <div class="hero-visual">
    <img src="{{ '/assets/images/ss-hotkeys.png' | relative_url }}" alt="Section Repeat workflow: mark a section with S and E, toggle repeat with R, and move between sections with A and D.">
  </div>
</section>

<div class="project-facts" aria-label="Project facts">
  <span><strong>Manifest V3</strong><small>Chrome extension</small></span>
  <span><strong>25 locales</strong><small>including RTL languages</small></span>
  <span><strong>Chrome 102+</strong><small>compatibility floor</small></span>
  <span><strong>Vanilla JS</strong><small>no runtime framework</small></span>
</div>

## Practice flow

<div class="feature-grid">
  <div class="feature-card"><strong>Mark & chain</strong><span>Press <kbd>S</kbd> to start and <kbd>E</kbd> to end. Press <kbd>E</kbd> again to continue with the next section.</span></div>
  <div class="feature-card"><strong>Repeat & navigate</strong><span>Toggle repeat with <kbd>R</kbd>, move with <kbd>A</kbd>/<kbd>D</kbd>, or jump directly to sections <kbd>1–9</kbd>.</span></div>
  <div class="feature-card"><strong>Local library</strong><span>Saved sections stay in Chrome local storage, with explicit JSON export and import for backups.</span></div>
  <div class="feature-card"><strong>Focused controls</strong><span><kbd>W</kbd> opens Focus Mode, <kbd>X</kbd> deletes the current section, <kbd>Z</kbd> undoes, and <kbd>Q</kbd> clears.</span></div>
</div>

## Engineering

Section Repeat is a compact browser-extension engineering project designed around **local-first data handling, resilient browser state, and testable behavior**.

<div class="engineering-grid">
  <div><strong>Minimal, local-first architecture</strong><br><span>Manifest V3, Vanilla JavaScript, service worker and content scripts. No analytics, advertising trackers, developer backend, or external API calls in the extension runtime.</span></div>
  <div><strong>Resilient state & storage</strong><br><span>Local/session storage, per-video locking, retry and recovery paths, storage maintenance, import/export, and session-only incognito behavior.</span></div>
  <div><strong>Privacy-aware identifiers</strong><br><span>YouTube video IDs are converted to SHA-256-based local keys using a random per-profile salt instead of being used as plain-text storage keys.</span></div>
  <div><strong>QA as part of the product</strong><br><span>Automated unit, integration, simulation, fuzz, mutation, and real-browser acceptance tooling guard editing rules, storage behavior, browser compatibility, and release integrity.</span></div>
  <div><strong>Internationalization</strong><br><span>25 locale bundles, including RTL languages, with locale-aware messages and number formatting.</span></div>
  <div><strong>Keyboard & accessibility details</strong><br><span>Keyboard-layout-aware shortcut labels, ARIA semantics, live status feedback, and popup/overlay interaction designed for keyboard use.</span></div>
</div>

<p class="project-links">
  <strong>Designed and developed by Eunjeong Song.</strong><br>
  <a href="https://songej.com">Portfolio</a> ·
  <a href="https://www.linkedin.com/in/songej">LinkedIn</a> ·
  <a href="{{ site.contact_url }}">Contact</a> ·
  <a href="{{ '/changelog/' | relative_url }}">Release notes</a> ·
  <a href="{{ '/privacy/' | relative_url }}">Privacy Policy</a>
</p>

<p class="fine-print">This site documents build v{{ site.version }}. Section Repeat for YouTube™ is an independent project and is not affiliated with or endorsed by YouTube or Google LLC. YouTube and Chrome are trademarks of Google LLC. Icon by <a href="https://www.iconfinder.com/iconfinder/khulqi-rosyid">khulqi Rosyid</a>, licensed under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.</p>
