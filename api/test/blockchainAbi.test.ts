import { Interface } from 'ethers';
import { MARKETPLACE_ABI } from '../src/services/blockchain';

describe('Marketplace ABI', () => {
  // ethers v6 returns null (rather than throwing) for unknown fragments.
  it('exposes the contract methods and events used by the API', () => {
    const iface = new Interface(MARKETPLACE_ABI);

    expect(iface.getFunction('createTask')).not.toBeNull();
    expect(iface.getFunction('commitEvaluation')).not.toBeNull();
    expect(iface.getFunction('revealEvaluation')).not.toBeNull();
    expect(iface.getFunction('finalize')).not.toBeNull();
    expect(iface.getFunction('getTaskMeta')).not.toBeNull();
    expect(iface.getEvent('TaskCreated')).not.toBeNull();
    expect(iface.getEvent('Committed')).not.toBeNull();
    expect(iface.getEvent('Revealed')).not.toBeNull();
    expect(iface.getEvent('Finalized')).not.toBeNull();

    expect(iface.getFunction('submitJob')).toBeNull();
    expect(iface.getFunction('getJob')).toBeNull();
  });
});
