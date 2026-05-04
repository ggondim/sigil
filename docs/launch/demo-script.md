# Cortex 30-second demo — recording instructions

This is the full shot list, exact commands, brand spec, and tooling guide for recording the demo. Follow top-to-bottom; everything you need is here.

## What gets recorded

A 30-second screencast showing the three-beat magic moment:

1. Claude Code without Cortex — doesn't remember what you decided yesterday
2. `cortex remember "..."` — captures it instantly
3. New Claude Code session — auto-recalls via the hook

No narration. Text overlays carry the story. Most viewers watch silent.

## Pre-record setup (5 minutes)

### 1. Clean Cortex state

```bash
# Reset to a clean DB so old session noise doesn't show up
cortex doctor --kill-stale 2>/dev/null
rm -rf ~/.cortex/db
cortex migrate

# Empty the demo namespace
DEFAULT_NAMESPACE=demo cortex namespace delete demo --confirm 2>/dev/null
```

### 2. Two windows, side-by-side

- **LEFT half of screen**: Claude Code (your normal Claude Code interface)
- **RIGHT half of screen**: a clean terminal

Both at full window height. Match the brand: `#FFFFFF` paper background where possible, JetBrains Mono terminal at 16pt.

### 3. Verify the hook is registered

This is what makes the third beat work — Claude Code must auto-call Cortex on every prompt.

```bash
cortex doctor
```

You should see `✓ UserPromptSubmit hook — registered`. If not, run `cortex init` and approve the hook registration step.

## The recording (30 seconds)

Time-stamped beat-by-beat:

```
0:00–0:01    Title card: "CORTEX  /  persistent memory for Claude Code"
             (paper background, ink type, maroon underline. snap-fade in 200ms)

0:01–0:09    LEFT pane (Claude Code).
             User types: "What's our deployment strategy?"
             Claude responds: "I don't have context about your deployment
             strategy. Could you share..."
             OVERLAY (top-center): "Claude doesn't remember what you decided yesterday"

0:09–0:10    Cut to RIGHT pane (terminal). Cursor blinking.
             OVERLAY: (none — breath beat)

0:10–0:16    Type the command (no slow-typing simulation — just type fast):

               $ cortex remember "We use canary deploys: 5% for 30min, then \
                 25%, then full cutover. Rollback via LaunchDarkly killswitch."

             Press Enter. Output:
               Remembered. (1 new)
             OVERLAY: "Tell Cortex once"

0:16–0:18    Smash cut to a NEW Claude Code window (visibly different
             — close the first one, open a fresh session). Tiny pause (0.3s).
             OVERLAY: "New session. Cortex auto-injects what matters."

0:18–0:27    Type the same question again: "What's our deployment strategy?"
             Claude's answer renders, drawing on the canary fact:
               "You use canary deploys — 5% traffic for 30 min, then 25%,
                then full cutover. Rollback is via LaunchDarkly killswitch."
             OVERLAY: (none — let the answer speak)

0:27–0:30    Wordmark return + URL.
             OVERLAY:
               CORTEX
               npm i -g @anmol-srv/cortex
               github.com/Anmol-Srv/cortex
```

## Brand spec (matches the Cortex Paper file)

- **Paper:** `#FFFFFF` (page background where possible)
- **Ink:** `#000000` (terminal background, primary text)
- **Maroon:** `#6B1A2A` (accent — wordmark underline, the `✓` in `Remembered.`, links)
- **Hairline:** `#DCDCDC` (1px dividers if you add any)
- **Type — display overlay:** Inter Tight, weight 400, tracking -0.04em
- **Type — body overlay (if any):** Inter
- **Type — terminal:** JetBrains Mono, 16pt, 1.4 line-height
- **No rounded corners.** No drop shadows. No gradients. (Cortex brand rules.)
- **No music**, or one quiet piano note at 0:00 only. Most viewers watch silent.
- **Transitions:** snap cuts only. No crossfades, no zoom, no spin.

## Aspect ratio + format

- **Primary:** 1:1 square, 1080×1080. Works for X, LinkedIn, HN thumbnail, Reddit.
- **Optional vertical re-cut:** 9:16, 1080×1920 for IG/TikTok/YouTube Shorts (re-frame, don't re-record).
- **Frame rate:** 30fps minimum, 60fps if your editor supports it (smoother typing).
- **Export:** MP4, H.264, target ~5-10MB.
- **Captions:** burn the overlay text in. Don't rely on platform auto-captions.

## Recommended tooling

- **Mac (recommended):** [Screen Studio](https://www.screen.studio/) — $129, best dedicated screencast tool. Smooth zooms, automatic cuts, clean cursor. Used by most product demos you've seen.
- **Free alternative:** macOS built-in (Cmd+Shift+5) for capture, then iMovie or DaVinci Resolve for editing + overlay text.
- **OBS Studio + DaVinci Resolve free** if you want fully free pro tooling (steeper learning curve).

## Final delivery checklist

Before posting:

- [ ] 30 seconds or under (verify in editor)
- [ ] Loops cleanly — last frame ≈ first frame for X autoplay
- [ ] Text overlays readable on phone screens — test by viewing on your phone
- [ ] No personal info in the recording: namespace, repo path, env vars, API keys
- [ ] Filename: `cortex-demo-30s.mp4`
- [ ] Backup the raw recording for future re-cuts (vertical, longer cuts, etc.)

## When the file exists

Send me:
- The MP4 file path or upload URL (Loom / YouTube / GitHub assets)

I'll:
- Replace the demo placeholder in `README.md`
- Replace the `[TODO: insert link]` in `docs/launch/show-hn-draft.md`
- Tell you when everything's wired up and the post is ready to send

## Why this matters

The 30-second demo is the single highest-leverage distribution asset you can produce this month. Show HN viewers don't read paragraphs — they watch the demo, then scroll comments. The X audience does the same. If the demo is clean, the launch lands. If the demo is hand-wavy, the launch doesn't.

It's worth the 30 minutes to get it right.
