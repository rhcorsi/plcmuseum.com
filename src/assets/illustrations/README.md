# Site illustrations

Original line illustrations of generic hardware categories, shown when an exhibit has no licensed photo (docs/tasks/TASK-003-silhouettes.md). Each `<name>.svg` has a `<name>.meta.json` sidecar with `license: original-illustration`, a root `<svg id="art" viewBox="0 0 640 260">` and strokes in `currentColor`; pages reference it with `<use href="...#art">`. `pnpm validate:content` checks all of this. No logos, wordmarks or label artwork.
