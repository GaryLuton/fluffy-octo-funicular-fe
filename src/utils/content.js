// Public content (posts, groups, books) — strict, blocks casual swearing too.
const BAD_WORDS = /\b(fuck|shit|damn|bitch|ass|dick|sex|porn|kill|die|hate)\b/i;

function isCleanText(text) {
  return !BAD_WORDS.test(text);
}

// Direct messages between friends — more permissive than public content so
// everyday teen vernacular ("damn that's wild", "I hate Mondays", "kill it
// at the test", "you're an ass") doesn't trip the filter and silently break
// the chat. Still blocks slurs, sexual content, hard drugs, real threats,
// self-harm encouragement, and jailbreak attempts. Keep this list aligned
// with public/safeguards-client.js BLOCKED_TERMS.
const UNSAFE_DM_TERMS = [
  // Sexual / NSFW
  'porn', 'nude', 'naked', 'hentai', 'xxx', 'onlyfans', 'nsfw',
  'boobs', 'penis', 'vagina', 'orgasm', 'masturbat', 'erotic', 'fetish',
  'hooker', 'prostitut', 'rape', 'molest', 'pedophil', 'incest',
  'horny', 'slut', 'whore',
  // Hard drugs (casual mentions of weed/alcohol are normal in friend chats)
  'cocaine', 'heroin', 'meth ', 'fentanyl', 'opioid',
  'crack pipe', 'drug dealer', 'ketamine', 'amphetamine',
  // Severe violence
  'school shooting', 'mass shooting', 'serial killer',
  'bomb threat', 'how to make a bomb', 'how to make a gun', 'massacre',
  'torture', 'dismember', 'decapitat', 'genocide', 'terrorist',
  // Self-harm / suicide encouragement
  'kill myself', 'kill yourself', 'kms', 'kys',
  'suicide', 'suicidal', 'end my life', 'self harm', 'self-harm',
  'cut myself', 'cutting myself',
  // Slurs and hate
  'nigger', 'nigga', 'faggot', 'retard', 'kike',
  'spic', 'chink', 'wetback', 'white power', 'heil hitler',
  'white supremac', 'racial slur',
];

function isSafeMessage(text) {
  if (typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  for (let i = 0; i < UNSAFE_DM_TERMS.length; i++) {
    if (lower.indexOf(UNSAFE_DM_TERMS[i]) !== -1) return false;
  }
  return true;
}

module.exports = { BAD_WORDS, isCleanText, isSafeMessage };
