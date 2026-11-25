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

test('checks every point in a finite witness using exact arithmetic', async () => {
  const x = '9007199254740993';
  const set = [x, '9007199254740995', '9007199254740997'];
  const witness = { kind: 'progression_witness', p: 3, polynomials: family, x, set };
  const run = await verify([witness, { ...witness, set: set.slice(1) }, { ...witness, p: 2 }]);
  expect(run.findings.map(({ status }) => status)).toEqual(['verified', 'contradicted', 'contradicted']);
  expect(JSON.parse(run.findings[0].evidence[0].supporting_excerpt).points).toEqual(set);
  expect(JSON.parse(run.findings[1].counterevidence[0].supporting_excerpt).missing_points).toEqual([x]);
  expect(run.findings[2].reason).toContain('offsets coincide');
  await expect(verify([{ ...witness, x: '0' }])).rejects.toThrow('Supply x');
  await expect(verify([{ ...witness, set: [1, 3, 5] }])).rejects.toThrow('Supply a set');
});

test('distinguishes the three Theorem 1.3 density bounds', async () => {
  const base = { kind: 'theorem_1_3', polynomial: ['0', '1'], multipliers: ['1', '-2'], part: 1 };
  const run = await verify([
    base,
    { ...base, multipliers: ['1', '-2', '3'], part: 2 },
    { ...base, polynomial: ['0', '0', '1'], part: 3 },
    { ...base, polynomial: ['0', '0', '1'] },
    { ...base, multipliers: ['0', '0'], polynomial: ['0'] },
  ]);
  expect(run.findings.map(({ status }) => status)).toEqual([
    'verified', 'verified', 'verified', 'contradicted', 'contradicted',
  ]);
  expect(run.findings.slice(0, 3).map((finding) =>
    JSON.parse(finding.evidence[1].supporting_excerpt).density_bound)).toEqual([
    'O(exp(-(log log N)^c))', 'O(exp(-(log log log N)^c))', 'O((log log log N)^(-c))',
  ]);
  expect(JSON.parse(run.findings[3].counterevidence[0].supporting_excerpt).computed_part).toBe(3);
  expect(JSON.parse(run.findings[4].counterevidence[0].supporting_excerpt).computed_part).toBeNull();
  expect(run.findings[4].reason).toMatch(/polynomial must be nonzero.*multipliers must be nonzero.*pairwise distinct/);
  await expect(verify([{ ...base, part: 4 }])).rejects.toThrow('part as 1, 2, or 3');
});
