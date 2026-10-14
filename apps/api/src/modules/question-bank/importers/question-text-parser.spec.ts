import { parseQuestionMarkdown } from './question-text-parser';

describe('parseQuestionMarkdown', () => {
  test('[TB] with one starred option yields a SINGLE_CHOICE question', () => {
    const { questions, errors } = parseQuestionMarkdown(
      '[TB] Tính $\\int_0^1 x^2\\,dx$\nA. $\\frac12$\n*B. $\\frac13$\nC. $1$',
    );
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(1);
    expect(questions[0].type).toBe('SINGLE_CHOICE');
    expect(questions[0].difficulty).toBe('MEDIUM');
    expect(questions[0].content).toContain('int_0^1');
    expect(questions[0].options.filter((o) => o.isCorrect)).toHaveLength(1);
  });

  test('two starred options yield a MULTIPLE_CHOICE question', () => {
    const { questions } = parseQuestionMarkdown('[DE] Chọn số chẵn\n*A. 2\n*B. 4\nC. 5');
    expect(questions).toHaveLength(1);
    expect(questions[0].type).toBe('MULTIPLE_CHOICE');
  });

  test('missing star produces an error naming the line, no question', () => {
    const { questions, errors } = parseQuestionMarkdown('[KHO] Câu khó\nA. một\nB. hai');
    expect(questions).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(1);
  });

  test('continuation line appends to the question content', () => {
    const { questions } = parseQuestionMarkdown('[DE] Dòng một\ntiếp dòng hai\n*A. x\nB. y');
    expect(questions).toHaveLength(1);
    expect(questions[0].content).toContain('Dòng một tiếp dòng hai');
  });
});
