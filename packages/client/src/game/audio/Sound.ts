import { Howl, Howler } from "howler";

type Category = "sfx" | "ui" | "music";

type SfxKey =
  | "fire_small"
  | "fire_big"
  | "boom_small"
  | "boom_big"
  | "thud"
  | "ui_click"
  | "turn"
  | "death";

const SFX_URLS: Record<SfxKey, string[]> = {
  fire_small: ["/audio/sfx/cannon_fire.ogg"],
  fire_big: ["/audio/sfx/cannon_fire.ogg"],
  boom_small: ["/audio/sfx/explosion_small.wav"],
  boom_big: ["/audio/sfx/explosion_big.wav"],
  thud: ["/audio/sfx/thud.ogg"],
  ui_click: ["/audio/sfx/ui_click.ogg"],
  turn: ["/audio/sfx/turn.ogg"],
  death: ["/audio/sfx/explosion_med.wav"],
};

const SFX_GAIN: Record<SfxKey, number> = {
  fire_small: 0.7, fire_big: 0.85, boom_small: 0.75, boom_big: 0.9,
  thud: 0.6, ui_click: 0.35, turn: 0.4, death: 0.8,
};

const SFX_CATEGORY: Record<SfxKey, Category> = {
  fire_small: "sfx", fire_big: "sfx", boom_small: "sfx", boom_big: "sfx",
  thud: "sfx", ui_click: "ui", turn: "ui", death: "sfx",
};

const TREAD_URL = "/audio/sfx/tread.ogg";

export type MusicContext = "menu" | "battle";
export interface Track { title: string; artist: string; url: string; }

const MUSIC_POOLS: Record<MusicContext, Track[]> = {
  menu: [
    { title: "Meanwhile",        artist: "Scott Buckley", url: "/audio/music/meanwhile.mp3" },
    { title: "Penumbra",         artist: "Scott Buckley", url: "/audio/music/penumbra.mp3" },
    { title: "Incantation",      artist: "Scott Buckley", url: "/audio/music/incantation.mp3" },
    { title: "Memories Of Stone",artist: "Scott Buckley", url: "/audio/music/memories_of_stone.mp3" },
    { title: "Convergence",      artist: "Scott Buckley", url: "/audio/music/convergence.mp3" },
    { title: "Echoes Of Home",   artist: "Scott Buckley", url: "/audio/music/echoes_of_home.mp3" },
    { title: "Amberlight",       artist: "Scott Buckley", url: "/audio/music/amberlight.mp3" },
    { title: "Wildflowers",      artist: "Scott Buckley", url: "/audio/music/wildflowers.mp3" },
  ],
  battle: [
    { title: "Simulacra",            artist: "Scott Buckley", url: "/audio/music/simulacra.mp3" },
    { title: "Eyes In The Void",     artist: "Scott Buckley", url: "/audio/music/eyes_in_the_void.mp3" },
    { title: "Song Of The Forge",    artist: "Scott Buckley", url: "/audio/music/song_of_the_forge.mp3" },
    { title: "Starfire",             artist: "Scott Buckley", url: "/audio/music/starfire.mp3" },
    { title: "Into The Wilds",       artist: "Scott Buckley", url: "/audio/music/into_the_wilds.mp3" },
    { title: "Born Of The Sky",      artist: "Scott Buckley", url: "/audio/music/born_of_the_sky.mp3" },
    { title: "Ride The Wind",        artist: "Scott Buckley", url: "/audio/music/ride_the_wind.mp3" },
    { title: "Honour Among Thieves", artist: "Scott Buckley", url: "/audio/music/honour_among_thieves.mp3" },
  ],
};

export interface NowPlaying {
  context: MusicContext;
  track: Track;
  trackIndex: number;
  poolSize: number;
  paused: boolean;
  position: number;
  duration: number;
}

type Listener = (info: NowPlaying | null) => void;

class SoundManager {
  private sfx = new Map<SfxKey, Howl>();
  private music = new Map<string, Howl>();
  private tread: Howl | null = null;
  private treadId: number | null = null;
  private treading = false;
  private currentMusic: {
    key: string;
    context: MusicContext;
    trackIndex: number;
    howl: Howl;
    id: number;
    paused: boolean;
  } | null = null;
  private listeners = new Set<Listener>();

  private master = 0.7;
  private musicGain = 0.35;
  private sfxGain = 0.8;
  private uiGain = 0.8;
  /** Per-category mute flags. When muted, the effective gain is 0 but the
   *  stored slider value is preserved so un-muting restores exactly the
   *  level the player had before. */
  private muted = { master: false, music: false, sfx: false, ui: false };
  private mutedListeners = new Set<() => void>();

  /** Browsers block <audio>/AudioContext until a user gesture. If playMusic
   * is called before any gesture happens, we stash the intent and fire it
   * on the first click / key / touch. */
  private pendingMusic: { context: MusicContext; trackIndex?: number } | null = null;
  private primed = false;

  init(): void {
    if (this.sfx.size > 0) return;
    for (const [key, urls] of Object.entries(SFX_URLS) as [SfxKey, string[]][]) {
      this.sfx.set(key, new Howl({ src: urls, volume: SFX_GAIN[key], preload: true }));
    }
  }

  play(key: string, opts: { volume?: number; rate?: number } = {}): void {
    const k = key as SfxKey;
    const howl = this.sfx.get(k);
    if (!howl) return;
    const cat = SFX_CATEGORY[k];
    const categoryGain = this.effective(cat === "ui" ? "ui" : "sfx");
    const vol = SFX_GAIN[k] * categoryGain * this.effective("master") * (opts.volume ?? 1);
    if (vol <= 0) return; // muted — skip the sound entirely
    const id = howl.play();
    howl.volume(vol, id);
    if (opts.rate != null) howl.rate(opts.rate, id);
  }

  setMasterVolume(v: number): void {
    this.master = clamp01(v);
    this.applyMusicVolume();
    Howler.volume(1);
  }

  setMusicVolume(v: number): void { this.musicGain = clamp01(v); this.applyMusicVolume(); }
  setSfxVolume(v: number): void { this.sfxGain = clamp01(v); }
  setUiVolume(v: number): void { this.uiGain = clamp01(v); }

  getVolume(c: "master" | "music" | "sfx" | "ui"): number {
    return c === "master" ? this.master
         : c === "music"  ? this.musicGain
         : c === "sfx"    ? this.sfxGain
         :                  this.uiGain;
  }

  isMuted(c: "master" | "music" | "sfx" | "ui"): boolean { return this.muted[c]; }

  /** Toggle mute for one category. Stored volume sliders are untouched so
   *  un-muting restores the exact level the player had before. */
  toggleMuted(c: "master" | "music" | "sfx" | "ui"): void {
    this.muted[c] = !this.muted[c];
    this.applyMusicVolume();
    for (const cb of this.mutedListeners) cb();
  }

  /** Subscribe to mute-state changes (UI re-render). */
  onMuteChange(cb: () => void): () => void {
    this.mutedListeners.add(cb);
    return () => this.mutedListeners.delete(cb);
  }

  /** Effective gain for a category — multiplier used by play() and the
   *  tread loop to honour mute without erasing the slider value. */
  private effective(c: "master" | "music" | "sfx" | "ui"): number {
    if (this.muted.master) return 0;
    if (c === "master") return this.master;
    if (this.muted[c]) return 0;
    return this.getVolume(c);
  }

  // ─── Tread loop ───────────────────────────────────────────────────
  setTread(on: boolean): void {
    if (on === this.treading) return;
    this.treading = on;
    if (on) {
      if (!this.tread) {
        this.tread = new Howl({ src: [TREAD_URL], loop: true, volume: 0 });
      }
      if (this.treadId == null) this.treadId = this.tread.play();
      else this.tread.play(this.treadId);
      const target = this.effective("sfx") * this.effective("master") * 0.55;
      this.tread.fade(0, target, 160, this.treadId);
    } else if (this.tread && this.treadId != null) {
      const target = this.effective("sfx") * this.effective("master") * 0.55;
      this.tread.fade(target, 0, 220, this.treadId);
      const t = this.treadId;
      const h = this.tread;
      setTimeout(() => { try { h.pause(t); } catch { /* ignore */ } }, 260);
    }
  }

  private applyMusicVolume(): void {
    if (!this.currentMusic || this.currentMusic.paused) return;
    this.currentMusic.howl.volume(
      this.effective("master") * this.effective("music"),
      this.currentMusic.id,
    );
  }

  // ─── Player controls ───────────────────────────────────────────────

  /** Call once from React on mount. Registers listeners that flip `primed`
   * on first user interaction and immediately replay the pending track. */
  installGesturePrimer(): void {
    if (this.primed) return;
    const prime = () => {
      if (this.primed) return;
      this.primed = true;
      // Howler auto-unlocks on gesture; just ensure we flush pending music.
      const pending = this.pendingMusic;
      this.pendingMusic = null;
      if (pending) this.playMusic(pending.context, pending.trackIndex);
      // If a track is already assigned but paused due to autoplay block,
      // try to resume it now.
      if (this.currentMusic) {
        try { this.currentMusic.howl.play(this.currentMusic.id); } catch { /* ignore */ }
      }
      document.removeEventListener("pointerdown", prime);
      document.removeEventListener("keydown", prime);
      document.removeEventListener("touchstart", prime);
    };
    document.addEventListener("pointerdown", prime);
    document.addEventListener("keydown", prime);
    document.addEventListener("touchstart", prime);
  }

  playMusic(context: MusicContext, trackIndex?: number): void {
    if (!this.primed) {
      this.pendingMusic = { context, trackIndex };
      return;
    }
    // Bail if music for this context is already playing — navigating
    // between menu pages (home/play/leaderboard/etc.) should not
    // restart the track.
    if (trackIndex === undefined && this.currentMusic?.context === context) {
      return;
    }
    const pool = MUSIC_POOLS[context];
    const idx = trackIndex ?? Math.floor(Math.random() * pool.length);
    const pick = pool[idx % pool.length]!;
    const key = `${context}:${pick.url}`;
    if (this.currentMusic?.key === key && !this.currentMusic.paused) return;
    this.stopMusic(600);
    let howl = this.music.get(key);
    if (!howl) {
      howl = new Howl({
        src: [pick.url],
        loop: false,
        volume: 0,
        html5: true,
      });
      howl.on("end", () => {
        if (this.currentMusic?.howl === howl) this.next();
      });
      this.music.set(key, howl);
    }
    const id = howl.play();
    howl.fade(0, this.effective("master") * this.effective("music"), 1400, id);
    this.currentMusic = {
      key, context, trackIndex: idx, howl, id, paused: false,
    };
    this.emit();
  }

  stopMusic(fadeMs = 400): void {
    if (!this.currentMusic) return;
    const { howl, id } = this.currentMusic;
    howl.fade(this.effective("master") * this.effective("music"), 0, fadeMs, id);
    const savedId = id;
    const savedHowl = howl;
    setTimeout(() => {
      try { savedHowl.stop(savedId); } catch { /* ignore */ }
    }, fadeMs + 60);
    this.currentMusic = null;
    this.emit();
  }

  togglePause(): void {
    if (!this.currentMusic) return;
    const { howl, id } = this.currentMusic;
    if (this.currentMusic.paused) {
      howl.play(id);
      howl.volume(this.effective("master") * this.effective("music"), id);
      this.currentMusic.paused = false;
    } else {
      howl.pause(id);
      this.currentMusic.paused = true;
    }
    this.emit();
  }

  next(): void {
    if (!this.currentMusic) return;
    const { context, trackIndex } = this.currentMusic;
    const pool = MUSIC_POOLS[context];
    this.playMusic(context, (trackIndex + 1) % pool.length);
  }

  previous(): void {
    if (!this.currentMusic) return;
    const { context, trackIndex } = this.currentMusic;
    const pool = MUSIC_POOLS[context];
    this.playMusic(context, (trackIndex - 1 + pool.length) % pool.length);
  }

  seek(seconds: number): void {
    if (!this.currentMusic) return;
    try { this.currentMusic.howl.seek(seconds, this.currentMusic.id); } catch { /* ignore */ }
    this.emit();
  }

  position(): number {
    if (!this.currentMusic) return 0;
    const p = this.currentMusic.howl.seek(this.currentMusic.id) as number;
    return typeof p === "number" ? p : 0;
  }

  duration(): number {
    return this.currentMusic?.howl.duration() ?? 0;
  }

  nowPlaying(): NowPlaying | null {
    if (!this.currentMusic) return null;
    const { context, trackIndex, paused } = this.currentMusic;
    const pool = MUSIC_POOLS[context];
    return {
      context,
      track: pool[trackIndex]!,
      trackIndex,
      poolSize: pool.length,
      paused,
      position: this.position(),
      duration: this.duration(),
    };
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.nowPlaying());
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    const info = this.nowPlaying();
    for (const l of this.listeners) l(info);
  }
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

export const Sound = new SoundManager();
