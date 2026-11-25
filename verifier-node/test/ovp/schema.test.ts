import Ajv2020 from 'ajv/dist/2020';
import { readFileSync } from 'fs';
import { join } from 'path';
import { VerificationPipeline } from '../../src/ovp/core/pipeline';

describe('OVP schemas', () => {
  it('validates a generated run against the OVP run schema', async () => {
    const schema = JSON.parse(readFileSync(join(__dirname, '../../../schemas/ovp-run.schema.json'), 'utf8'));
    const validate = new Ajv2020({ strict: false }).compile(schema);
    const pipeline = new VerificationPipeline();
    expect(validate(await pipeline.verify({ text: 'A claim is externally testable.' }))).toBe(true);
    expect(validate(await pipeline.verifyMathPaper(JSON.stringify([
      { kind: 'theorem_1_2', polynomials: [['0', '1'], ['0', '0', '1']] },
      { kind: 'nondegenerate_example', polynomials: [['0', '1'], ['0', '0', '1']], p: 2 },
    ])))).toBe(true);
  });
});
