# Section Repeat for YouTube™ — website

Source of [sectionrepeat.com](https://sectionrepeat.com/), published by GitHub
Pages from `main`, folder `/(root)`, custom domain `sectionrepeat.com`.

This repository is the website only. The extension is developed separately and
distributed through the
[Chrome Web Store](https://chromewebstore.google.com/detail/section-repeat-for-youtub/pppgnfkfeciopablcbkjdohiknebahkc).

## Pages

| File | URL | What it is |
| --- | --- | --- |
| `index.html` | `/` | What the extension does, the shortcuts, where it works, privacy in brief |
| `changelog.md` | `/changelog/` | Release notes, newest first, written for users |
| `privacy.md` | `/privacy/` | Privacy policy (linked from the Chrome Web Store listing) |

`_layouts/default.html` holds the header and footer; `assets/css/site.css` is
the whole stylesheet. There is no theme and no Sass: the CSS is served as
written.

## Releasing a new extension version

1. Change `version` in `_config.yml`. Every page reads it from there.
2. Add the release to the top of `changelog.md` with an anchor, e.g.
   `## 1.9.31 {#v1-9-31}`. Describe what users will notice; leave internal
   testing work out.
3. If the release changes permissions or how data is stored, update
   `privacy.md` and its **Last updated** date.

Deploy after the Chrome Web Store has published the version, so the site never
describes a build users can't install yet.

## Design

- One typeface, Atkinson Hyperlegible Next, self-hosted from `assets/fonts/`
  (SIL Open Font License, `assets/fonts/OFL.txt`). It was designed so similar
  characters can't be confused, which matters on a page made of single keys.
  Being self-hosted, the site makes no third-party requests.
- Red is used only where the extension itself uses it (section marks on the
  progress bar) and for the install button. Everything else is ink on paper,
  with a dark scheme that follows the system setting.
- The progress-bar picture on the home page is HTML and CSS, not an image. Its
  looping playhead stops when the system asks for reduced motion.
- `assets/images/og-image.png` is a 1200×630 render of `_tools/og-card.html`
  (not published). To regenerate it, open that file in Chrome with a 1200×630
  viewport and take a screenshot.

## Preview locally

GitHub Pages builds with Jekyll 3.10. To match it:

```sh
gem install jekyll -v 3.10.0
gem install kramdown-parser-gfm jekyll-sitemap webrick
jekyll serve
```
