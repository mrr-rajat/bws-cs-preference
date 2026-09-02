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

## Search

The search field above the participant list filters and ranks as you type. Every word must match something in a record
(so `sunita previous` finds Sunita with a previous CS). It searches name, study ID, indication, co-morbidities, previous-CS
event, other surgery, education, occupation, interviewer and status, plus numbers (age, height, weight, income, parity,
APAIS score) and dates in several forms (`03/09`, `3 sep`, `2026-09-03`). Exact matches rank above prefixes, prefixes
above substrings, and one- or two-letter typos still match for words of 4+ letters. A bare number 1–224 puts that ID first.
Each result shows which fields matched.

## Backups

- **Save backup** writes one JSON file named `CS-Preference-BWS_backup_YYYY-MM-DD_HH-MM-SS_nNN.json` (device date and time, NN = participants) containing every participant so far.
  Choose *Save to Files* in the share sheet and pick **On My iPad**, or a USB stick plugged into the device.
  Each backup is a complete snapshot, so only the newest one matters.
- The home screen shows how many participants, complete **or partial**, have changed since the last backup. By default the app
  **blocks new participants when 5 are pending** (change in Settings; 0 disables the block).
- A form that was opened but never filled in is discarded automatically when you leave it, and its ID is released.
- **Export CSV does not count as a backup**: only Save backup clears the not-backed-up count, because only the JSON file can be restored.
- **Import backup** restores from any backup file, for example after reinstalling. Newer records win on conflict.
- Weekly: AirDrop or copy the latest backup to the study laptop, so two devices hold the data.
- Internally the app writes every change to two separate stores (localStorage and IndexedDB) and repairs one from the other.

## Export for analysis

**Export CSV** produces one file, `CS-Preference-BWS_data_<date_time>_nNN.csv`, in long format:

- One row per outcome shown, i.e. 48 rows per completed participant (12 tasks × 4 outcomes). A participant with no
  completed task still gets one row with the task columns blank, so no proforma data is lost.
- The participant columns (study ID, status, proforma fields, APAIS items and scores, timestamps) are repeated on every
  row of that participant. The task columns are `presentation_order`, `task_id`, `position`, `outcome_id`, `outcome_en`,
  `best`, `worst`, `task_started_at`, `task_completed_at`, `task_seconds`.

This is directly the shape a conditional logit needs, and everything else is a one-liner away:

```r
library(dplyr); library(survival)
d <- read.csv("CS-Preference-BWS_data_2026-09-03_10-30-00_n224.csv")

# one row per participant (proforma + APAIS)
participants <- d |> distinct(participant_id, .keep_all = TRUE) |> select(participant_id:updated_at)

# analysis set: completed participants only
long <- d |> filter(status == "complete", !is.na(task_id))

# maxdiff conditional logit: best and worst choices as separate strata per task
best  <- long |> mutate(choice = best,  sign =  1, strata_id = paste(participant_id, presentation_order, "B"))
worst <- long |> mutate(choice = worst, sign = -1, strata_id = paste(participant_id, presentation_order, "W"))
m <- clogit(choice ~ outcome_id:sign - 1 + strata(strata_id),
            data = bind_rows(best, worst) |> mutate(outcome_id = relevel(factor(outcome_id), ref = "O12")))
summary(m)

# best-minus-worst counts per outcome
long |> group_by(outcome_id, outcome_en) |> summarise(B = sum(best), W = sum(worst), BW = B - W) |> arrange(-BW)
```

The JSON backup file remains the complete raw copy; the CSV is derived from it.

## Things to check before going live

1. **Hindi text.** The outcome names and descriptions were re-typed from the protocol PDF images because the text
   layer of the PDF was garbled. Proofread them in `core.js` against the approved Annexure III.
2. **APAIS in Hindi.** The protocol contains APAIS in English only. The Hindi shown under each item is an unofficial
   working translation for the interviewer. Replace it with your validated Hindi APAIS or delete the Hindi lines.
3. **Participants 201–224.** These sequences were generated by the same method as 1–200 but are not in the file the IEC saw.
   Mention this in the study file or replace them with sequences from your original R script.
4. **Patient name.** Recorded by default (as on the paper proforma). Settings → "Record patient name" turns it off for study-ID-only operation.
5. **Storage limit.** Each participant is about 5 KB; 224 participants is about 1 MB, far below any iOS limit.

## Appearance

Settings → Appearance: **System** (follows the device), **Light**, or **Dark**. Applied immediately and remembered on the device.

The palette uses traditional Japanese colours (nippon-iro): ivory 象牙色 and unbleached-silk 白練 surfaces, betel-nut 檳榔子染 text,
persimmon-tannin 柿渋 as the accent, thousand-year-pine 千歳緑 for BEST and sappanwood 蘇芳 for WORST. Dark mode uses a warm
charcoal with 赤朽葉, 若竹 and 薄紅 accents. All text/background pairs meet WCAG AA contrast.

## Factory reset

Settings → **Factory reset this device…** erases all participant records and restores default settings (interviewer
*Anshul*, block at 5 un-backed-up participants, name field on). It asks for confirmation twice, the second time by typing
`RESET`. Backup files already saved and the hosted app are not affected.

## Updating the app

Edit the files, bump `VERSION` in `sw.js` and `APP_VERSION` in `app.js`, re-upload. Devices pick up the new version the
next time they are opened while online. Data on the device is untouched by updates.
