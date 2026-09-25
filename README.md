# Piano Scales

A small mobile scale viewer. Tap the upper third to move to the previous mode, the lower third for the next mode, and the left or right side of the middle third to change key. Keyboard arrow keys work too.

The two-octave keyboard highlights one complete scale from root to octave root in orange, with note names on those keys. The seven diatonic modes follow this order: Major (Ionian), Dorian, Phrygian, Lydian, Mixolydian, Minor (Aeolian), Locrian.

Serve the folder with any static web server, for example:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000` on your computer. To use it on an iPhone, host the folder over HTTPS, open the site in Safari, then choose **Share → Add to Home Screen**. The manifest, Apple touch icon, and service worker allow it to launch as a standalone app and work offline after the first visit.

## Railway

Connect this repository to Railway and generate a public domain. Railway detects and serves the static HTML site directly.
