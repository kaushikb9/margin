# showcase

kaushik.sh/projects/ reads this folder to show margin. Keep it current whenever
the app's look, name or status changes, and bump `updated` when you do.
Contract: `~/Code/brain/design-system/INVARIANTS.md` → Portfolio.

- `showcase.json`: name, line (under 110 characters, for a stranger), url,
  url_label, repo (public repos only), public, updated.

## No screenshots yet

The panel renders in a normal browser (`npm run preview`), but without a desk it only says "No desk yet", and the only seed (`seeds/7xTGNNLPyMI-tracker.json`) is KB's real study notes.

To add them: an invented seed for one public lecture, loaded into the mock desk (`npm run dev`, `TA_MOCK=1`), with the panel shot in both colour schemes. `public` turns true when a stranger can install it without KB's desk. Then write the command here and drop the two PNGs in.
