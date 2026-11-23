// Study configuration. Everything a researcher is expected to change lives here.
// Values marked DECISION are protocol choices made as working defaults; review
// them against README.md before recruiting.
export const config = {
  // Which of the two 2AFC experiments this deployment runs. Recorded in every
  // session and submission. The second experiment reuses this app with its own
  // stimuli.js / assets and its own experiment id (see README).
  experiment: {id: 'exp1-lines-with-edges', name: 'Lines with edges'},
  // Bump protocolVersion whenever the design or participant-facing procedure
  // changes. A session stored in a participant's browser is continued only if
  // protocolVersion, stimulusSetVersion, layoutVersion and the whole `design`
  // block match; otherwise a fresh session starts.
  protocolVersion: '2026-10-06-v1',
  stimulusSetVersion: '2026-10-07-unit-lines-v2',
  layoutVersion: '2026-10-07-unit-lines-v2',

  study: {
    title: 'Similarity judgment',
    // Shown on the information/consent page. Fill these in before recruiting.
    institution: '',
    researcher: '',
    contactEmail: 'Amit.Gur@UAntwerpen.be',
    ethicsReference: '',
    durationMinutes: 3,
    // DECISION: the pilot uses a plain Continue button. Set true to require an
    // "I agree to take part" checkbox before continuing.
    requireConsentCheckbox: false,
    // DECISION: a separate consent page with the text below and an "I agree"
    // checkbox before anything else (consentPage), and an age and gender page
    // (demographics) before calibration.
    consentPage: true,
    consentText: [
      'Dear participant,',
      {text: 'You wish to participate in a scientific study of visual perception, on how people judge the similarity of simple figures, carried out by Amit Gur (University of Antwerp) and Ivana Bianchi (University of Macerata) under the direction of [NAME OF THE RESEARCHER ULTIMATELY RESPONSIBLE FOR THE PROJECT].', highlight: '[NAME OF THE RESEARCHER ULTIMATELY RESPONSIBLE FOR THE PROJECT]'},
      'In a moment, we will present you a short computer task. First you match an outline on the screen to an ID card, so that the figures appear at their true size. Then you see 19 screens, each showing a reference object (A) and two comparison objects (B and C), and on each screen you indicate with the arrow keys or the mouse which of the two comparison objects looks more similar to the reference. There are no right or wrong answers. This will take about 5 minutes.',
      'This is an anonymous study: we do not collect your name, e-mail address or IP address, and you are not recognizable to the researchers at any time, nor in the data we collect. Your responses are stored together with your Prolific participant number, which only Prolific can link to you and which we remove from the dataset before publication. All data from this study are stored digitally in a secure, password-protected database and will be kept for 10 years after the end of the study.',
      'You have the right to refuse to participate and to stop your participation at any time, by closing this window. You do not have to explain this and this will not entail any disadvantage or loss of benefits. All data already collected at that time can be used for data analysis.',
      'The researchers of this study have the right to share anonymous databases (in which participants are not recognizable to anyone) with (inter)national colleagues in the context of this and/or later scientific research. These data files are not accessible to other parties, including yourself or companies/organizations that do not fit within scientific research institutions. The results are published in scientific journals and presentations in a form in which no participant is recognizable.',
      {text: 'This study has been approved by the Ethics Committee for the Social Sciences and Humanities of the University of Antwerp (PENDING APPROVAL – reference number and date will be added later).', highlight: '(PENDING APPROVAL – reference number and date will be added later)'},
      'If you have any further questions or comments, please contact Amit Gur, Amit.Gur@UAntwerpen.be.',
    ],
    // Age and gender come from Prolific, so the page is off.
    demographics: false,
    minAge: 18,
    maxAge: 120,
    consentVersion: '2026-11-23-v4',
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
    // DECISION: when the link carries no identifier, ask the participant to
    // make up a code on the first page and to reuse it in the other study.
    // No list ties codes to people unless they tell you their code. Set
    // false to allow anonymous runs. (Links made by
    // tools/make_participant_links.py carry the code and skip the question.)
    // Participants are recruited through Prolific, whose link carries
    // PROLIFIC_PID, so no code is asked for (false). Set true to ask for an
    // 8-digit code when the link carries no identifier.
    requireCode: false,
    // Accepted code pattern for a typed code: exactly 8 digits.
    codePattern: '^[0-9]{8}$',
    // Additional URL parameters copied verbatim into the session record.
    passthroughParams: ['STUDY_ID', 'SESSION_ID', 'source'],
  },

  storage: {
    // DECISION: where completed sessions are sent.
    // 'supabase'      - inserts into this experiment's tables in Supabase
    //                   (created by supabase/migrations/0001_experiment_tables.sql).
    // 'netlify-forms' - posts to the Netlify Forms endpoint of this site
    //                   (form "line-similarity-responses" in index.html).
    // 'endpoint'      - POSTs the session as JSON to `endpoint` below.
    // 'local'         - nothing is sent; participants download their file.
    mode: 'supabase',
    // Supabase project URL (https://<ref>.supabase.co) and anon/publishable
    // key, from the project's API settings. The anon key is public by design;
    // row level security lets it insert only.
    supabase: {url: 'https://yrgwlvqkqgqxcfcyxkta.supabase.co', anonKey: 'sb_publishable_xHK8bsu5oSo-xhYo8bk2lg_HIv6fHy2', sessionsTable: 'lines_with_edges_sessions', trialsTable: 'lines_with_edges_trials'},
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
    // Prolific completion URL, e.g. 'https://app.prolific.com/submissions/complete?cc=XXXXXXXX'
    // (the completion code from the Prolific study page). The final page
    // redirects there after redirectDelayMs once the responses are saved.
    redirectUrl: '',
    redirectDelayMs: 5000,
  },
};
