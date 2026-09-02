# CS Preference BWS — offline data collection app

Offline iPad/iPhone app for the study *Patient priorities for outcomes related to anaesthesia and
perioperative care during elective caesarean delivery: a best-worst scaling study* (MAMC / Lok Nayak Hospital).

It follows the pre-generated randomisation file exactly (task order and option order per participant),
enforces one BEST and one WORST per task, records the case proforma and the APAIS anxiety scale,
stores everything on the device, and exports CSVs ready for conditional logit in R.

## Files

| File | Purpose |
|---|---|
| `index.html`, `app.js`, `core.js` | The app. `core.js` is pure logic (design, validation, CSV export); `app.js` is the screens and storage. |
| `design.js` | The randomisation schedule embedded in the app: participants 1–200 from `participant_randomisation_wide.csv`, 201–224 generated with the same method (seed 20260903). |
| `data/participant_randomisation_wide_224.csv` | The same schedule as a CSV, for the analysis and the study file. Rows 1–2400 are identical to the original file. |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Make the page installable and fully offline. |
| `test/` | Automated tests (`node test/test.js` for logic; `node test/run-chrome.js` for a full interview in headless Chrome). |

## One-time installation on the iPad or iPhone

The app is hosted with GitHub Pages from this repository (public; it contains only the questionnaire and the
randomisation schedule, never patient data):

**https://mrr-rajat.github.io/bws-cs-preference/**

1. Every push to `main` redeploys the site automatically within a minute or two.
2. On the device, open the URL above in **Safari** (not Chrome), with internet available.
3. Tap Share → **Add to Home Screen** → Add.
4. Open the app from the home screen icon once while still online so it finishes caching.
5. Turn off Wi-Fi and open it again to confirm it works offline.

From then on the app never needs internet. Always open it from the home-screen icon, not from Safari:
the icon has its own storage that iOS does not clear automatically.

## Daily procedure

1. Home → **New participant — ID n**. The ID is assigned automatically in order; it is the study ID for the paper consent form.
2. Fill the case proforma (required fields are enforced), then the APAIS scale (6 items, scores computed).
3. Read the Hindi instruction screen to the patient, tap Start.
4. For each of the 12 tasks: tap ✓ on the most important outcome, ✗ on the least important. The app greys out the
   ✓ row's ✗ so the same outcome cannot be both. Next only unlocks when both are chosen. Back is allowed.
5. On Finish the participant is marked Complete and the review screen shows all choices.
6. Tap **Save backup** on the review screen (see below). Then Done.

An interview can be interrupted at any point: every tap is saved, and **Save & exit** in the header returns to Home.
Home shows **Resume ID n (partial …)** for each unfinished participant; partial records are included in backups and exports with status `in_progress`.
Withdrawn or converted-to-emergency patients: open the participant → Mark as withdrawn. Their data is kept and flagged.

## Backups

- **Save backup** writes one JSON file named `CS-Preference-BWS_backup_YYYY-MM-DD_HH-MM-SS_nNN.json` (device date and time, NN = participants) containing every participant so far.
  Choose *Save to Files* in the share sheet and pick **On My iPad**, or a USB stick plugged into the device.
  Each backup is a complete snapshot, so only the newest one matters.
- The home screen shows how many participants, complete **or partial**, have changed since the last backup. By default the app
  **blocks new participants when 1 is pending** (change in Settings; 0 disables the block). So you cannot start a second
  form on top of a half-finished one without saving a backup first.
- A form that was opened but never filled in is discarded automatically when you leave it, and its ID is released.
- **Import backup** restores from any backup file, for example after reinstalling. Newer records win on conflict.
- Weekly: AirDrop or copy the latest backup to the study laptop, so two devices hold the data.
- Internally the app writes every change to two separate stores (localStorage and IndexedDB) and repairs one from the other.

## Export for analysis

**Export CSVs** produces three files:

- `CS-Preference-BWS_participants_<date_time>_nNN.csv` — one row per participant: study ID, status, proforma fields, APAIS items and scores, tasks completed, timing.
- `CS-Preference-BWS_bws-long_<date_time>_nNN.csv` — one row per alternative shown (participant × task × 4 outcomes) with `best`/`worst` indicators. This is the input for the conditional logit.
- `CS-Preference-BWS_bws-choices_<date_time>_nNN.csv` — one row per task: the 4 outcomes shown in position order and the chosen best and worst (audit trail).

Minimal R example for the best and worst choices as two conditional-logit strata per task:

```r
library(dplyr); library(survival)
long <- read.csv("CS-Preference-BWS_bws-long_2026-09-03_10-30-00_n224.csv") |> filter(status == "complete")
best  <- long |> mutate(choice = best,  strata_id = paste(participant_id, presentation_order, "B"))
worst <- long |> mutate(choice = worst, strata_id = paste(participant_id, presentation_order, "W"), sign = -1)
d <- bind_rows(mutate(best, sign = 1), worst) |> mutate(outcome_id = relevel(factor(outcome_id), ref = "O12"))
m <- clogit(choice ~ outcome_id:sign - 1 + strata(strata_id), data = d)   # maxdiff coding
summary(m)
```

(Alternatively the `support.BWS` package can build the maxdiff design from the `bws-choices` file.)

## Things to check before going live

1. **Hindi text.** The outcome names and descriptions were re-typed from the protocol PDF images because the text
   layer of the PDF was garbled. Proofread them in `core.js` against the approved Annexure III.
2. **APAIS in Hindi.** The protocol contains APAIS in English only. The Hindi shown under each item is an unofficial
   working translation for the interviewer. Replace it with your validated Hindi APAIS or delete the Hindi lines.
3. **Participants 201–224.** These sequences were generated by the same method as 1–200 but are not in the file the IEC saw.
   Mention this in the study file or replace them with sequences from your original R script.
4. **Patient name.** Off by default (study ID only). Settings → "Record patient name" turns the field on if the committee wants it in the app.
5. **Storage limit.** Each participant is about 5 KB; 224 participants is about 1 MB, far below any iOS limit.

## Factory reset

Settings → **Factory reset this device…** erases all participant records and restores default settings (interviewer
*Anshul*, block at 1 un-backed-up participant, name field off). It asks for confirmation twice, the second time by typing
`RESET`. Backup files already saved and the hosted app are not affected.

## Updating the app

Edit the files, bump `VERSION` in `sw.js` and `APP_VERSION` in `app.js`, re-upload. Devices pick up the new version the
next time they are opened while online. Data on the device is untouched by updates.
