import { VerificationPipeline } from '../../src/ovp';

const family = [['0', '1', '0'], ['0', '0', '1']];
const verify = (checks: unknown[]) => new VerificationPipeline().verifyMathPaper(JSON.stringify(checks));

test('checks the distinct-degree hypotheses without asserting full theorem applicability', async () => {
  const run = await verify([
    { kind: 'theorem_1_2', polynomials: family },
    { kind: 'theorem_1_2', polynomials: [['0', '0', '1'], ['0', '0', '2']] },
    { kind: 'theorem_1_2', polynomials: [['1'], ['0', '0']] },
  ]);
  expect(run.findings.map(({ status }) => status)).toEqual(['verified', 'contradicted', 'contradicted']);
  expect(run.findings[0].limitations[0]).toContain('sufficiently large N');
  expect(run.findings[0].evidence[0].locator).toContain('2608.19525v1');
  expect(run.findings[1].reason).toContain('degrees must be pairwise distinct');
  expect(run.findings[2].reason).toMatch(/nonconstant.*constant term/);
});

test('reports an exact witness, repeated offsets, and a composite shift parameter', async () => {
  const run = await verify([3, 2, 4].map((p) => ({ kind: 'nondegenerate_example', polynomials: family, p })));
  expect(run.findings.map(({ status }) => status)).toEqual(['verified', 'contradicted', 'contradicted']);
  expect(JSON.parse(run.findings[0].evidence[0].supporting_excerpt).offsets).toEqual(['0', '2', '4']);
  expect(JSON.parse(run.findings[1].counterevidence[0].supporting_excerpt).offsets).toEqual(['0', '1', '1']);
  expect(run.findings[2].reason).toContain('composite');
});

test('keeps large integers exact and rejects malformed inputs', async () => {
  const run = await verify([{
    kind: 'nondegenerate_example', polynomials: [['0', '9007199254740993']], p: 3,
  }]);
  expect(JSON.parse(run.findings[0].evidence[0].supporting_excerpt).offsets).toEqual(['0', '18014398509481986']);
  await expect(verify([{ kind: 'theorem_1_2', polynomials: [['1e4']] }])).rejects.toThrow('coefficient');
  await expect(verify([{ kind: 'nondegenerate_example', polynomials: family, p: 1e9 }])).rejects.toThrow('integer p');
});

test('records only the declared checker identity in each finding', async () => {
  const run = await verify([{ kind: 'theorem_1_2', polynomials: family }]);
  expect(JSON.parse(JSON.stringify(run.findings[0].checker))).toEqual({ name: 'shifted_prime', version: '1.0.0' });
});
