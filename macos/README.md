# Lean Into It.app

A Dock app that wraps the Lean Into It dev server. Click the icon and the
app opens in Chrome at its fixed port; quit the Dock icon and the server
stops, if the app started it. The pattern is Fret Not's (`../fret-not/macos`),
which took it from Lingo Dojo, Wine Guide and Basecamp.

```sh
./macos/build-app.sh     # builds and installs /Applications/Lean Into It.app
open -a "Lean Into It"
```

The launcher starts the server; it does not install anything. Before the
first launch, run once in the repo: `npm install`, `npm --prefix web install`,
`npm run lean:setup` and `npm run db:setup` (Postgres 17 running).

## What is in here

- **`Lean Into It.applescript`** is the Dock face, a stay-open applet.
  - `run` and `reopen` start the server if it is down, then focus the Chrome
    tab already on http://localhost:38800, or open one (see Chrome tab reuse).
  - The health check fetches `/` and requires the page's own
    `<title>Lean Into It</title>`, so another process on the port is never
    taken for the app. It waits for the web server only, not for Lean: Lean
    takes longer to wake, and the page shows that itself.
  - `idle` quits the Dock icon after three failed health checks in a row.
    One miss is normal: editing a server file restarts Vite, and the port is
    unbound for a moment.
  - `quit` stops Vite only if this app started it. A server it found already
    running (your own `npm run dev`) is left alone. Vite closing also stops
    the warm Lean (`lake serve`), which is its child.
- **`server-shim.c`** is compiled by `build-app.sh` into the executable of
  the nested, faceless **Lean Into It Server.app** (`Contents/Helpers/`).
  All it does is `exec` the runner script. Building needs a working `clang`.
- **`server-runner.sh`** runs `npm --prefix web run dev` from the repo root
  as its blocking child, in a login shell. A process started from the Dock
  does not get the terminal's `PATH`, only what `~/.zprofile` sets. The
  runner puts `~/.elan/bin` in front of it and Homebrew's directories
  (`/opt/homebrew/bin`, `/usr/local/bin`) after it, so Lean's `lake` is
  found and a node chosen in the profile is not overridden. (The server
  also looks in those directories for `lake` itself.) The Tutor needs
  `claude` on the profile's `PATH`.
- **`icon.svg`** is the icon's source: the turnstile ⊢ leaning forward on an
  indigo tile, teal fact dots on its upright and an amber goal dot at the
  end of its arm (the app's indigo, with the border colours of its fact
  and goal cards). `render-icon.sh`
  turns it into `icon-1024.png` with `sips`; `build-app.sh` makes the
  `.icns` from the PNG. Flat fills only, because `sips` draws SVG without
  filters or text.

The app itself is a build product and is not committed. Rebuild after
changing the AppleScript, the shim, the runner or the icon.

### Why a helper app runs the server

Two facts about macOS privacy control (TCC) force this shape. The repo lives
under `~/Documents`, which is protected.

1. A Documents grant does not survive being orphaned. A `nohup`'d server is
   handed to launchd, loses its launcher's grant, and dies with a silent
   EPERM. So the server stays the blocking child of a helper app that lives
   as long as it does.
2. The helper's executable must be a real compiled binary. Since macOS
   26.6.2 (measured 2026-08-29 in wine-guide), a bundle whose executable is
   a script runs as `/bin/zsh`, which macOS will not prompt for and will not
   match a Full Disk Access row against: it is denied with no prompt. Before
   that update the opposite was true. If you read this after another macOS
   release, measure again before trusting either direction.

## First launch, and after every rebuild

macOS asks twice, once each:

- **Documents access for "Lean Into It Server".** Approve it, or the server
  cannot read the repo. The runner writes what to do into the log.
- **Automation access to Google Chrome for "Lean Into It".** This is what
  lets a second click return to the open tab.

Every rebuild signs the bundles again (ad hoc), which changes their code
identity. The old grant no longer applies, and macOS may deny without
asking again. `build-app.sh` prints a note when the helper's identity
changed. To recover, in order:

1. `tccutil reset SystemPolicyDocumentsFolder com.scalefreegan.leanintoit.server`,
   then relaunch, so a fresh prompt can appear.
2. If there is still no prompt: System Settings → Privacy & Security →
   Full Disk Access → "+" → add
   `/Applications/Lean Into It.app/Contents/Helpers/Lean Into It Server.app`,
   then relaunch.

The server's log is `~/Library/Logs/LeanIntoIt.log`; the run before it is
kept as `LeanIntoIt.log.old`.

## Chrome tab reuse

Clicking the icon while the app is open brings back the Chrome tab you were
using: any tab whose URL starts with http://localhost:38800, so a lesson
page counts. With no such tab it opens one. If clicks keep opening new tabs,
look in the log for a `[launcher] Chrome tab focus failed` line. `-1743`
means Automation access was refused: allow it under System Settings →
Privacy & Security → Automation, or run
`tccutil reset AppleEvents com.scalefreegan.leanintoit` and click again.
If Chrome cannot be reached at all, the app falls back to `open`, which uses
the default browser.

## Port

`web/vite.config.ts` pins the server to **38800** (`strictPort`), so the
health check and the URL never change. `npm run dev` by hand uses the same
port:

- If the Dock app is running, a manual server fails loudly, by design.
- If a manual server is running first, the app adopts it, and Quit leaves it
  running.
- If the server takes longer than 30 seconds to answer, the app gives up
  ownership so that it cannot kill a server that is still starting. Later
  clicks adopt it, and Quit leaves it; stop it by hand with
  `pkill -f 'lean-into-it/web/node_modules/.bin/vite'` (with the checkout's
  own directory name, if it is not `lean-into-it`).

## Repo path

Nothing is tied to this machine. `build-app.sh` takes the checkout it lives
in and bakes that path into the applet's kill pattern and the runner's `cd`.
Move or clone the repo, rebuild, and the launcher follows. Running
`macos/server-runner.sh` by hand works too: it falls back to its own
location.

## Caveats

The bundle id is personal (`com.scalefreegan.leanintoit`) and the signing is
ad hoc. This is a personal launcher, not an app to distribute. Like the dev
server itself, it serves on localhost only.
