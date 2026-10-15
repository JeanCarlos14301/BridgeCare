# Submission package (lablab.ai, AMD Developer Hackathon ACT III)

Draft texts for the submission form, the video, and the deck. Every number here comes from `eval/README.md` section 3. Replace each `TODO` before submitting, and never put the reviewer password in this repository.

## Form fields

**Submission title** (max 50 characters, this one is 37):

> BridgeCare – Safe AI Discharge Sheets

**Short description** (max 255 characters, this one is 234):

> BridgeCare turns discharge documents into clear patient sheets, in English or Spanish. Every field cites its source, altered doses and contradictions block the output, and only a human reviewer approves. AI inference runs on AMD GPUs.

**Long description** (min 100 words):

> Discharge is the moment a patient goes home with written instructions: which medicines to take, how much, how often, for how long, when to come back, and which symptoms mean danger. Those sheets are prepared under time pressure from dense clinical documents, and a single miscopied dose or an unnoticed contradiction can harm a patient. Patients who do not read the document's language are at even higher risk.
>
> BridgeCare is a review assistant for nurses and discharge coordinators. An open model running on AMD GPUs (AMD Token Factory, MiMo-V2.6-Flash) drafts the patient sheet from the discharge document. The backend never trusts that draft: every field must cite the exact text it came from, medication values must appear verbatim in a verified quote (an altered "50" for "500" is caught), and a contradiction between two parts of the document blocks approval until a reviewer records a resolution note. The model cannot approve anything; only an authenticated reviewer approves one exact, hashed revision, and any edit or reprocessing invalidates that approval. The printable patient sheet is built only from validated fields and can be shown in Spanish through a deterministic, reviewable glossary that never translates medication names, doses or units and visibly flags anything it cannot translate.
>
> On five synthetic discharge documents, three consecutive real runs on AMD matched 142 of 144 expected medication fields, blocked the contradictory case every time, and never repeated an injected instruction. BridgeCare does not diagnose, treat, or calculate doses; it makes the last step of a discharge faster and safer, and it knows when to stop.

**Main track:** Track 2 – Health and Wellbeing.

**Technologies** (choose the matching entries at lablab.ai/tech): AMD (Token Factory, AMD Developer Cloud / Radeon Cloud GPUs), MiMo-V2.6-Flash, FastAPI, Python, React, TypeScript, Vite, SQLite, Docker, Caddy, Microsoft Azure.

**GitHub repository:** https://github.com/JeanCarlos14301/BridgeCare (must be public before submitting).

**Demo application platform:** Microsoft Azure virtual machine (web and API) with inference on AMD Token Factory.

**Demo application URL:** https://bridgecare-team944.northcentralus.cloudapp.azure.com

**Additional information** (paste into the form; fill the password there only):

> All documents are synthetic. Open the demo, pick any fixture and process it (about 15–20 seconds on AMD). To approve and print the patient sheet, log in as reviewer with password `TODO-in-form-only`. Recommended path: fx04 shows a contradictory dose that blocks approval until a resolution note is written; fx05 contains a prompt-injection attempt that never reaches the output; use the language switch on the patient sheet to see the Spanish version with untranslated phrases flagged. Visitors are limited to a few processing runs to protect the shared AMD quota. Evaluation method and raw reports: `eval/README.md` and `eval/reports/`.

**Cover image:** 16:9. TODO (Edgar): product screenshot of the review view with the fx04 conflict and the gate, plus the BridgeCare name. No patient photos, no AMD or Evolus logos unless the rules allow them.

## Video script (3 minutes, under the 5-minute limit)

| Time | Block | What is shown and said |
| --- | --- | --- |
| 0:00–0:20 | The problem | A dense discharge document. "A nurse has minutes to turn this into instructions a patient can follow. One miscopied dose is a medication error." |
| 0:20–1:05 | Clear case (fx01) | Process on the live URL; source on the left, fields with citations on the right; click a citation to highlight the exact quote; approve; open and print the patient sheet; switch it to Spanish. |
| 1:05–1:55 | It knows when to stop (fx04) | Two different doses in the same document; the gate shows `conflicting_field`; approve is blocked; the patient sheet answers 409; the reviewer writes a resolution note and only then approves. Mention that an altered dose or a quote that is not in the document blocks the same way. |
| 1:55–2:20 | Powered by AMD | The provider pill with model, latency, request ID and the AMD Token Factory host; the Token Factory usage page (key hidden). |
| 2:20–2:45 | What we measured | 142/144 medication fields over three runs, conflict blocked 15/15 times, 0/6 injection leaks, about 15–20 s per case. TODO: manual versus assisted review time once measured; otherwise say it is the next validation step. |
| 2:45–3:00 | Who it is for | Discharge coordination in clinics and emergency departments: faster, safer last step of a visit, in the patient's language. Next step: validation with clinical staff. |

Rules for the recording: use the live URL with real inference, never the mock; hide the API key and the reviewer password; label the video as a recording.

## Deck (6 slides)

1. **User and task:** discharge nurse or coordinator; turning clinical documents into patient instructions.
2. **Current problem:** dense documents, time pressure, miscopied doses, contradictions, language barriers.
3. **Demo walkthrough:** source, cited fields, gate, approval, patient sheet (English and Spanish).
4. **Controls and the blocked case:** verbatim medication check, citation check, conflict note, model never approves, revision hash.
5. **AMD architecture and metrics:** Azure VM (Caddy, web, API) to AMD Token Factory; the evaluation table with numerators and denominators.
6. **Team, buyer and next step:** Jean, Daniel, Felipe, Edgar; buyer is hospital and clinic discharge coordination; next step is a pilot review with clinical staff.

## Evidence checklist

- [ ] Repository public, opens in an incognito window, README works, MIT license present.
- [ ] Live URL passes `scripts/check_deploy.py` (15/15) on the submitted commit.
- [ ] Video uses a real AMD run and shows the blocked case; no personal data, key or password on screen.
- [ ] Deck, cover image, short and long descriptions ready.
- [ ] AMD evidence: model id, request ID, latency in the UI; Token Factory usage page with the key hidden.
- [ ] Known limits stated: synthetic data only, small evaluation sample, no clinical validation, manual time baseline (TODO).
- [ ] All four members registered on lablab.ai and in the team.
- [ ] Form submitted and the confirmation checked by Jean and Daniel.
