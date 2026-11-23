(() => {
  'use strict';
  const letters = 'ABCD';

  function shuffle(items, random = Math.random) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function remapReferences(text, labels) {
    // Match choice references, not initials in names such as C. Mác.
    return text.replace(/(?:đáp án|phương án|lựa chọn|ý)\s+[ABCD](?:\s*(?:,|\/|và|hoặc)\s*[ABCD])*\b|\b[ABCD](?:\s*(?:,|\/|và|hoặc)\s*[ABCD])+\b/gu,
      reference => reference.replace(/\b[ABCD]\b/g, letter => labels[letter]));
  }

  function makeQuestion(question, shuffled, random = Math.random) {
    if (!shuffled) return question;
    const order = shuffle(question.options, random);
    const labels = Object.fromEntries(order.map((option, index) => [option.id, letters[index]]));
    return {
      ...question,
      question: remapReferences(question.question, labels),
      options: order.map((option, index) => ({
        ...option,
        id: letters[index],
        text: remapReferences(option.text, labels).replace(
          /^(Cả\s+(?:3|ba)\s+(?:phương án|đáp án)|Tất cả\s+(?:các\s+)?(?:phương án|đáp án|ý kiến|công việc|lực lượng))\s+trên\b/iu,
          '$1 còn lại')
      })),
      correctAnswers: question.correctAnswers.map(letter => labels[letter])
    };
  }

  const api = { shuffle, makeQuestion };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.QUIZ_SESSION = api;
})();
