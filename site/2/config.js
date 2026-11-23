// Study configuration. Everything a researcher is expected to change lives here.
// Values marked DECISION are protocol choices made as working defaults; review
// them against README.md before recruiting.
export const config = {
  // Which of the two 2AFC experiments this deployment runs. Recorded in every
  // session and submission. The second experiment reuses this app with its own
  // stimuli.js / assets and its own experiment id (see README).
  experiment: {id: 'exp2-similarity-with-rotation', name: 'Similarity with rotation'},
  // Bump protocolVersion whenever the design or participant-facing procedure
  // changes. A session stored in a participant's browser is continued only if
  // protocolVersion, stimulusSetVersion, layoutVersion and the whole `design`
  // block match; otherwise a fresh session starts.
  protocolVersion: '2026-10-06-v1',
  stimulusSetVersion: 'squares-diamonds-2026-10-31',
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
      'You are invited to take part in a scientific study on visual perception, conducted by Amit Gur and Ivana Bianchi, University of Antwerp and University of Macerata. Please read the following before deciding to participate.',
      {title: 'What you will do', text: 'You will see a series of 24 screens, each showing a reference figure (A) and two comparison figures (B and C), made of small squares or diamonds. On each screen, you decide which of the two comparison figures is most similar to the reference, by pressing the left or right arrow key or by clicking on the figure. There are no right or wrong answers; just follow your visual impression. Before the task, you will be asked to match an outline on the screen to a card so that the figures are shown at their true size. The whole experiment takes 1 to 3 minutes.'},
      {title: 'Voluntary participation', text: 'Taking part is entirely voluntary. You may stop at any moment by closing this window, without giving a reason and without any disadvantage. If you stop before the end, the responses you have already given can still be used in the data analysis, because they cannot be traced back to you.'},
      {title: 'Anonymity', text: 'No identifying information is collected: no name, e-mail address or IP address is stored. Your responses, your reaction times and technical details of your screen and browser are stored under your Prolific participant number only, which contains no personal details and is removed from the dataset before publication.'},
      {title: 'Data storage and retention', text: 'The data are stored on a secure, password-protected database to which only the researchers have access. They will be kept for 10 years after the end of the study and then deleted.'},
      {title: 'Use of data', text: 'The data obtained in this session will be used for a scientific study and may be published in anonymized, aggregated form in scientific journals and presentations.'},
      {title: 'Risks', text: 'There are no known risks beyond those of ordinary computer use.'},
      {title: 'Ethical approval', text: 'This study has been approved by the Ethics Committee for the Social Sciences and Humanities of the University of Antwerp (PENDING APPROVAL – reference number and date will be added later).', highlight: '(PENDING APPROVAL – reference number and date will be added later)'},
      {title: 'Contact', text: 'Questions or complaints about the study may be addressed to Amit.Gur@UAntwerpen.be.'},
    ],
    // Age and gender come from Prolific, so the page is off.
    demographics: false,
    minAge: 18,
    maxAge: 120,
    consentVersion: '2026-11-23-v3',
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
    supabase: {url: 'https://yrgwlvqkqgqxcfcyxkta.supabase.co', anonKey: 'sb_publishable_xHK8bsu5oSo-xhYo8bk2lg_HIv6fHy2', sessionsTable: 'similarity_with_rotation_sessions', trialsTable: 'similarity_with_rotation_trials'},
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
    localKey: 'line-similarity:rotation:session:v1', // keep distinct per experiment
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
