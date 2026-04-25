# Audio sources

Original full-length audio files used to derive the trimmed sfx in
`packages/client/public/audio/sfx/`. Kept here so we can re-trim or
extend a clip without re-downloading.

Not served to clients — `assets/` is outside the Vite public dir.

## Files

- `low_time_source.mp3` — Dragon Studio · "Clock Ticking Down" (#376897) on
  Pixabay. 8.99s, 256 kbps stereo. The first 1.0s (with a 0.12s fade-out)
  is encoded to `low_time.wav` and used as the turn-time-running-out
  warning.
