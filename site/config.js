// Study configuration. Everything a researcher is expected to change lives here.
// Values marked DECISION are protocol choices made as working defaults; review
// them against README.md before recruiting.
export const config = {
  // Which of the two 2AFC experiments this deployment runs. Recorded in every
  // session and submission. The second experiment reuses this app with its own
  // stimuli.js / assets and its own experiment id (see README).
  experiment: {id: 'exp1-line-similarity', name: 'Line similarity'},
  // Bump protocolVersion whenever the design or participant-facing procedure
  // changes. A session stored in a participant's browser is continued only if
  // protocolVersion, stimulusSetVersion, layoutVersion and the whole `design`
  // block match; otherwise a fresh session starts.
  protocolVersion: '2026-10-06-v1',
  stimulusSetVersion: '2026-10-05-compact-control-v1',
  layoutVersion: '2026-10-05-compact-control-v1',

  study: {
    title: 'Similarity judgment',
    // Shown on the information/consent page. Fill these in before recruiting.
    institution: '',
    researcher: '',
    contactEmail: '',
    ethicsReference: '',
    durationMinutes: 5,
    // DECISION: the pilot uses a plain Continue button. Set true to require an
    // "I agree to take part" checkbox before continuing.
    requireConsentCheckbox: false,
    consentVersion: '2026-10-06-v1',
  },

  design: {
    // DECISION: where the plain-line control (trial 0.1) is presented.
    // 'random' mixes it in with every other question (researcher's choice:
    // all 2AFC questions interleaved); 'first' opens with it; 'excluded' drops it.
    controlPosition: 'random',
    // DECISION: shuffle all presentations per participant (seeded, recorded),
    // so families and pair types (E/L, E/P, L/P) are fully interleaved rather
    // than grouped by object.
    randomizeTrialOrder: true,
    // Reject shuffles where two consecutive screens show the same object family.
    avoidConsecutiveSameFamily: true,
    // DECISION: left/right assignment of the two comparison conditions.
    // 'random'  - a recorded coin flip per presentation (19 presentations)
    // 'fixed'   - the canonical order from data/trials.json (19 presentations)
    // 'both'    - every pair in both orders (38 presentations). The interim
    //             record sent on leaving is then too large for the browser's
    //             64 KiB beacon limit, so a compact version is sent (a minimal
    //             one from about 70 answered screens); see EXPERIMENT_DATA.md.
    sideAssignment: 'random',
    // DECISION: how many times the whole set is presented. Each pass is
    // interleaved separately; the family constraint is also enforced across
    // the boundary between passes.
    repetitions: 1,
    // Blank stage between a response and the next presentation.
    interTrialIntervalMs: 500,
    // Keys accepted for the left (B) and right (C) object.
    keys: {left: ['ArrowLeft', 'b', 'B'], right: ['ArrowRight', 'c', 'C']},
  },

  participant: {
    // Remember a participant's session in their browser so a reload resumes
    // it and a finished participant sees the completion page again. Off for
    // the pilot: every visit starts a fresh run.
    rememberSession: false,
    // URL parameters searched, in order, for a participant identifier.
    // e.g. ?pid=123 or Prolific's ?PROLIFIC_PID={{%PROLIFIC_PID%}}
    idParams: ['pid', 'PROLIFIC_PID', 'participant'],
    // Additional URL parameters copied verbatim into the session record.
    passthroughParams: ['STUDY_ID', 'SESSION_ID', 'source'],
  },

  storage: {
    // DECISION: where completed sessions are sent.
    // 'netlify-forms' - posts to the Netlify Forms endpoint of this site
    //                   (form "line-similarity-responses" in index.html).
    // 'endpoint'      - POSTs the session as JSON to `endpoint` below.
    // 'local'         - nothing is sent; participants download their file.
    // The pilot collects nothing yet: 'local'.
    mode: 'local',
    endpoint: '',
    formName: 'line-similarity-responses',
    // Send an interim record (flagged 'abandoned') if the participant leaves
    // after answering at least one screen but before the final record was
    // sent. Nothing is sent for dropouts before the first response. Each
    // reload mid-study sends one; records share the session_id.
    submitPartialOnLeave: true,
    // Offer a JSON/CSV download of the session on the completion page.
    allowDownload: false,
    // localStorage key for crash/reload recovery.
    localKey: 'line-similarity:session:v1', // keep distinct per experiment
  },

  completion: {
    // Show a completion code on the final page (config.completion.code, or
    // the session id when that is empty). Off for the pilot.
    showCode: false,
    // The completion code. Leave empty to use the session id.
    code: '',
    // If set, a link/redirect offered after submission (e.g. a Prolific
    // completion URL). Leave empty for none.
    redirectUrl: '',
  },
};
