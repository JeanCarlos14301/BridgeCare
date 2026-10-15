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

**GitHub repository:** https://github.com/JeanCarlos14301/BridgeCare 

**Demo application platform:** Microsoft Azure virtual machine (web and API) with inference on AMD Token Factory.

**Demo application URL:** https://bridgecare-team944.northcentralus.cloudapp.azure.com

**Additional information** 

> All documents are synthetic. Open the demo, pick any fixture and process it (about 15–40 seconds on AMD, depending on load). To approve and print the patient sheet, log in as reviewer with password `TODO-in-form-only`. Recommended path: fx04 shows a contradictory dose that blocks approval until a resolution note is written; fx05 contains a prompt-injection attempt that never reaches the output; fx07 is an emergency department discharge for a cough: approve it and use the language switch on the patient sheet to see the Spanish version, with any untranslated phrase flagged EN. Visitors are limited to a few processing runs to protect the shared AMD quota. Evaluation method and raw reports: `eval/README.md` and `eval/reports/`.



