# Sousaphones Are Everywhere

A small, friend-made archive of sousaphones and other low brass spotted on screen.
Buildless HTML/CSS/JavaScript, designed for GitHub Pages at https://shduff.github.io/tubas/.

## Current setup status

The site and Apps Script publisher source are implemented. The catalog starts empty: no invented sightings or film stills. Google account setup, the real form URL, authorization, and a full test submission are still required before submissions work. GitHub Pages must be enabled for `main` / root in repository Settings → Pages.

## Records

`data/catalog.json` contains version 1, `submissionUrl`, and an `entries` array. Each entry has a stable `id`, `title`, `type` (`movie`, `tv`, `other`), optional `year`, `season`, `episode`, `episodeTitle`, optional `description`, `genres`, and `sightings`. No director field or contributor accounts.

Each sighting has `id`, `instruments`, `timestamp`, `caption`, optional `credit`, `sourceNote`, `sourceUrl`, and `media`. Media have `kind` (`image` or `video`), relative `url`, `alt`, optional `caption`, and optional `poster`. GIFs use `image`. The first still, or a poster for a video, supplies the card thumbnail. Clips without a still have a play card. Filters operate on individual sightings, and a title's other sightings are available in the detail dialog.

## Google setup (not yet performed)

1. Create a **private Google Sheet** named **Sousaphones Are Everywhere — Submissions** in your Drive. Open Extensions → Apps Script. Copy `automation/Code.gs` into the bound script. Enable the manifest in Project Settings and replace it with `automation/appsscript.json`.
2. Run `setup` as the owner and authorize it. It creates the review queue, a Google Form, and installable form-submit and review-edit triggers. Rerunning setup reuses the same form and triggers.
3. In the created form editor, manually add an optional **File upload** question titled **Images or clips**. Allow multiple files (suggested max: 5), images and videos, 10 MB per file. Move it just below Caption. Google’s Apps Script Forms service cannot create this question. Publish the form for your intended respondents, permitting external Google accounts if desired. Do not restrict it to your organization unless intentional. Do not enable the public response summary.
4. Create a **fine-grained GitHub token** restricted to **shduff/tubas**, with **Contents: read and write**. Keep the token only in Apps Script → Project Settings → Script Properties as **GITHUB_TOKEN**. Never paste it into this repository, a cell, or chat. Record its expiration; replace the property when it expires.
5. In the spreadsheet, reload and choose **Sousaphones → Connect form link to website**. The form must have the upload question first. This updates the public catalog's submission link.
6. Submit a test using an image you are comfortable publishing. Confirm the title, text, attachments, optional credit, and optional private contact email land in **Review queue**. With Approved unchecked, confirm nothing appears in the public catalog.
7. Check **Approved** on that row. The publisher creates image blobs and commits those plus the updated catalog atomically. Pages then updates. Verify the entry and image on the live site and that contact email / file IDs did not enter the public commit.
8. Test retry behavior, a submission without an image, and a second sighting attached to the first title before declaring the integration complete.

Only the owner needs to authorize the script and hold the GitHub credential. Contributors use Google sign-in for file uploads, with optional unverified public credit. The spreadsheet and script must remain private to the owner / trusted admins: script editors can access its credentials.

## Everyday use

Review a row, adjust its public details if needed, and check **Approved**. Published status means the repository update succeeded; allow time for Pages deployment. A **Needs media** row stays private. Add Drive file IDs to the private file column when an image is found. Re-check Approved after correcting **Needs attention** errors. No folders or entry files need to be created manually.

Exact repeated title metadata groups sightings. If identity is ambiguous, the publisher flags the row with a proposed entry ID; put it in **Existing entry ID** to explicitly attach to that title. For remakes, provide the release year. Published rows are immutable through the checkbox: unchecking does not remove the public entry, and editing the row does not silently overwrite it. Public corrections/removals currently require a repository edit.

The **Published URL** points to the sighting. **Import missed form responses** recovers form responses missed by a failed trigger without duplicating existing rows. **Publish approved submissions** retries queued approved rows. Errors leave the public site unchanged; uploaded but unreferenced Git blobs may remain after a failed commit and are not publicly linked by the catalog.

## Limits and upkeep

- Accepted formats: JPG, PNG, GIF, WebP, MP4, WebM. HEIC/MOV require conversion. Publisher limits: 10 MB/file, 20 MB/submission.
- Files remain privately in Drive as originals and are copied to public GitHub only after approval. No Drive upload URL needs to be made public.
- The catalog uses an allowlist of public fields. Free-text public captions may contain personal information if the contributor types it there; review them.
- Apps Script runs under the trigger creator's account and is subject to Google quotas. This design is intended for a few friends, not a large public upload service.
- The token will need renewal if it expires. Drive storage and GitHub Pages size limits still apply. Consider separate media storage if the archive becomes video-heavy.

## Local checks

Run `npm test` (Node.js 20+). Preview with any static HTTP server from the repository root, e.g. `python3 -m http.server 8000`. No build or dependency installation is required. Google Fonts are optional enhancements; system font fallbacks work offline.
