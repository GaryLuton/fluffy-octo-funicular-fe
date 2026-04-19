const BAD_WORDS = /\b(fuck|shit|damn|bitch|ass|dick|sex|porn|kill|die|hate)\b/i;

function isCleanText(text) {
  return !BAD_WORDS.test(text);
}

module.exports = { BAD_WORDS, isCleanText };
