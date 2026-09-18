# Data Protection Impact Assessments

Two processes are treated as high-risk: (A) AI Study Copilot (Google Gemini) and (B) identity/institution verification with uploaded documents. Status: DRAFT pre-filled from the implementation; the owner/DPO must review, complete the TODO items, sign and date.

Assessment date: TODO(owner). Assessor / DPO: TODO(owner). Next review: annually or on material change.

---

## A. AI Study Copilot

### 1. Description of processing
* Users type prompts and may attach images. The client calls the `gemini-proxy` Supabase edge function (`src/api/aiCopilot.ts`), which calls the Google Gemini API using a server-side key, and returns the answer.
* Data: prompt text, images, any personal data the user chooses to include, user ID/IP (request metadata).
* Purpose: study assistance. Lawful basis: consent per submission.
* Recipients: Google (processor). Transfer: outside Nigeria.

### 2. Necessity and proportionality
* Optional feature; users can decline. The Terms tell users not to submit others' personal data.
* Minimisation: only the prompt/image the user submits is sent; the API key never leaves the server.
* TODO(owner): confirm whether prompts/responses are logged or stored by Lioris (edge function logs, any history table) and set retention; confirm Google API terms (data not used to train models on paid/API tier - verify current terms).

### 3. Risks to individuals

| Risk | Likelihood | Severity | Mitigation | Residual |
| --- | --- | --- | --- | --- |
| Users paste third-party personal data or sensitive data into prompts | Medium | Medium | Terms warning; add an in-UI notice next to the prompt box (TODO) | Low-Medium |
| Provider-side retention/use of prompts | Low-Medium | Medium | DPA with Google; API (not consumer) terms; disclosure in Privacy Policy | Low |
| Inaccurate output relied on as advice | Medium | Low-Medium | Disclaimer in Terms and UI | Low |
| Cross-border transfer without safeguards | Medium | Medium | DPA/SCCs; transfer assessment (owner) | Low once documented |
| Abuse of key / cost | Medium | Low (privacy) | Server-side key, rate limiting; rotate on exposure (incident-response.md) | Low |
| Image contains faces/minors | Low | Medium | Terms; users must not upload others' images without permission | Low-Medium |

### 4. Outcome
Proceed subject to: DPA with Google signed; in-UI privacy hint; retention decision documented; transfer assessment. TODO(owner): approve.

---

## B. Institutional and ID verification

### 1. Description of processing
* Users may apply for the verified tick by uploading a student ID card, admission letter or similar (`src/api/verification.ts`, stored in Supabase Storage); authorised admins review and record a decision.
* Data: document image (photo, name, matriculation number, institution), review decision, reviewer ID, timestamps. Also the institutional email domain match.
* Purpose: prove affiliation and maintain trusted campus spaces. Lawful basis: contract and legitimate interest; consent for voluntary submission.
* Recipients: Supabase (processor), authorised admins/reviewers.

### 2. Necessity and proportionality
* Non-institutional emails are allowed without a document; documents are needed only for the verified tick.
* Retention: document deleted 30 days after the decision (`RETENTION.verificationDocumentsDaysAfterDecision`), or immediately when the account is deleted. TODO(owner): confirm the scheduled purge job exists (see retention-and-deletion.md).
* Users are advised to cover unnecessary details (e.g. card number, address) where possible. TODO: add guidance text in the upload modal.

### 3. Risks to individuals

| Risk | Likelihood | Severity | Mitigation | Residual |
| --- | --- | --- | --- | --- |
| Breach of stored ID documents enabling identity fraud | Low | High | Private bucket, RLS, signed URLs, short retention, admin MFA, audit log | Medium-Low |
| Over-broad admin access | Medium | High | Limit reviewer role, audit log of views (TODO(owner): verify), training | Low-Medium |
| Retention beyond purpose | Medium | Medium | 30-day purge; deletion on account erasure | Low |
| Wrong rejection (automated decision) | Low | Medium | Decisions are made by human reviewers; appeal via support | Low |
| Minors submitting ID | Low | High | 18+ gate; reject and delete under-18 documents | Low |
| Storage of special-category data (photo) | Medium | Medium | Same controls; do not use for any other purpose (no biometric matching) | Low |

### 4. Outcome
Proceed subject to: confirmed purge job, private bucket policy verified, admin access review, upload guidance text. TODO(owner): approve, sign, date.
