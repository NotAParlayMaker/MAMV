import fs from 'fs';
import os from 'os';
import path from 'path';
import { ProgramRegistry, computeProgramHash } from '../../programs/registry';
import { ProgramContext } from '../../programs/interface';
import { EvidenceBundleV02 } from '../../shared/types';

const hex = (byte: string, count: number): `0x${string}` => `0x${byte.repeat(count)}`;

const fixturesDir = path.join(__dirname, 'fixtures', 'programs');

// The fixture program validates against evidence_bundle.v1, which pins
// version '1.0.0' while allowing v0.2 fields; EvidenceBundleV02 pins '1.1.0'.
// Keep the schema-valid value and cast across that known type/schema gap.
function buildBundle(): EvidenceBundleV02 {
  return {
    schema_version: '1',
    version: '1.0.0' as unknown as EvidenceBundleV02['version'],
    task_id: 'task-1',
    bundle_version: '0.2',
    created_at: '2024-01-01T00:00:00Z',
    evaluator: {
      node_id: 'node-test',
      eth_address: hex('11', 20),
      software: { name: 'verifier-node', ver: '0.1.0', commit: 'abc123' },
    },
    prompt_hash: hex('22', 32),
    rubric_hash: hex('33', 32),
    model_runs: [
      {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.1,
        raw_output: 'hello',
        output_hash: hex('44', 32),
      },
    ],
    claims: [],
    metrics: {
      consensus: { agreement: 0.9, clusters: 1 },
      factuality: { supported_claim_ratio: 0.9 },
      citation_quality: { authority_score: 0.9 },
      bias: { sensitive_variance: 0 },
      stability: { reask_delta: 0.1 },
    },
    final_score_bps: 9000,
    explanation: 'ok',
    signatures: { bundle_sig_eip712: hex('11', 65) },
    input: { content_type: 'text', content_hash: hex('55', 32) },
    output: { content_type: 'text', content_hash: hex('66', 32) },
    provenance: {
      model_runs: [
        {
          provider: 'openai',
          model: 'gpt-4',
          prompt_hash: hex('22', 32),
          response_hash: hex('44', 32),
          started_at: 1,
          finished_at: 2,
        },
      ],
    },
    scoring_trace: {
      rubric_hash: hex('33', 32),
      score_bps: 9000,
      verdict: 'reliable',
      breakdown: {},
      generated_at: 1,
    },
  };
}

function buildContext(programHash: string): ProgramContext {
  return {
    task_id: 'task-1',
    input_hash: hex('22', 32),
    output_hash: hex('44', 32),
    bundle_hash: hex('77', 32),
    bundle_uri: 'ipfs://bundle',
    bundle_version: '0.2',
    chain_id: 421614,
    contract_address: hex('88', 20),
    llm_provider: 'openai',
    llm_model: 'gpt-4',
    program_hash: programHash,
  };
}

describe('ProgramRegistry', () => {
  it('loads programs from filesystem', () => {
    const registry = new ProgramRegistry({ programsDir: fixturesDir });
    registry.loadPrograms();
    const programs = registry.listPrograms();
    expect(programs.some((program) => program.id === 'fixture-program')).toBe(true);
  });

  it('rejects invalid semver versions', () => {
    const invalidDir = path.join(__dirname, 'fixtures', 'invalid-programs');
    const registry = new ProgramRegistry({ programsDir: invalidDir });
    expect(() => registry.loadPrograms()).toThrow(/Invalid semver/);
  });

  it('produces deterministic program hashes', () => {
    const programDir = path.join(fixturesDir, 'fixture-program');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(programDir, 'manifest.json'), 'utf8')
    );
    const hash1 = computeProgramHash(programDir, manifest);
    const hash2 = computeProgramHash(programDir, manifest);
    expect(hash1).toBe(hash2);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'program-fixture-'));
    fs.cpSync(programDir, tempDir, { recursive: true });
    const tempManifest = JSON.parse(
      fs.readFileSync(path.join(tempDir, 'manifest.json'), 'utf8')
    );
    const originalHash = computeProgramHash(tempDir, tempManifest);
    fs.appendFileSync(path.join(tempDir, 'index.js'), '\n// change');
    const updatedHash = computeProgramHash(tempDir, tempManifest);
    expect(updatedHash).not.toBe(originalHash);
  });

  it('fails when evidence requirements are not met', async () => {
    const registry = new ProgramRegistry({ programsDir: fixturesDir });
    registry.loadPrograms();
    const bundle = buildBundle();
    bundle.model_runs = [];

    const record = registry.resolveProgram('fixture-program', '1.2.3');
    const context = buildContext(record.hash);

    await expect(
      registry.runProgram(bundle, context, 'fixture-program', '1.2.3')
    ).rejects.toThrow(/model_runs/);
  });

  it('returns receipts with program hash', async () => {
    const registry = new ProgramRegistry({ programsDir: fixturesDir });
    registry.loadPrograms();
    const record = registry.resolveProgram('fixture-program', '1.2.3');
    const receipt = await registry.runProgram(
      buildBundle(),
      buildContext(record.hash),
      'fixture-program',
      '1.2.3'
    );
    expect(receipt.program?.hash).toBe(record.hash);
  });
});

describe('program epistemic declarations', () => {
  it('rejects a missing provenance declaration', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'program-no-provenance-'));
    fs.cpSync(path.join(fixturesDir, 'fixture-program'), temp, { recursive: true });
    const manifestPath = path.join(temp, 'manifest.json'); const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); delete manifest.program_provenance; fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => new ProgramRegistry({ programsDir: path.dirname(temp) }).loadPrograms()).toThrow();
  });
});
