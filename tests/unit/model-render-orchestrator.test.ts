import { describe, expect, it, vi } from 'vitest';
import { createModelRenderOrchestrator } from '../../src/worker/model-render-orchestrator';
import type { FbxConvertCommandResult } from '../../src/worker/fbx/convert-command';

function harness(convertFbx = vi.fn(async (): Promise<FbxConvertCommandResult> => ({
  status: 'ready', glbArtifactId: 'glb', glbRelativePath: 'glb', missingTextures: [], warnings: [],
}))) {
  const ports = {
    convertFbx,
    resolveCompanions: vi.fn((): Array<{ assetId: string; revisionId: string; relativeFilePath: string; extension: string }> => []),
    authorizeSource: vi.fn((input: { libraryId: string; assetId: string; revisionId: string }) => ({
      ...input, absolutePath: 'C:/fixture/model', mimeType: 'model/gltf-binary',
    })),
    requestModelRender: vi.fn(async () => ({ status: 'failed' as const, errorCode: 'MODEL_LOAD_FAILED' as const })),
  };
  return { ports, render: createModelRenderOrchestrator(ports) };
}
function input(signal = new AbortController().signal) {
  return { libraryId: 'library', assetId: 'asset', revisionId: 'revision', relativeFilePath: 'model.fbx', byteSize: 20, signal };
}

describe('production model orchestration', () => {
  it('does not convert a pre-aborted job', async () => {
    const controller = new AbortController(); controller.abort();
    const { ports, render } = harness();
    await expect(render(input(controller.signal))).rejects.toMatchObject({ name: 'AbortError' });
    expect(ports.convertFbx).not.toHaveBeenCalled();
  });

  it.each(['ready', 'failed'] as const)('stops after deferred FBX conversion (%s) when cancelled', async (status) => {
    let complete!: (result: FbxConvertCommandResult) => void;
    const convert = vi.fn(() => new Promise<FbxConvertCommandResult>((resolve) => { complete = resolve; }));
    const { ports, render } = harness(convert);
    const controller = new AbortController();
    const result = render(input(controller.signal));
    controller.abort();
    complete(status === 'ready'
      ? { status, glbArtifactId: 'glb', glbRelativePath: 'glb', missingTextures: [], warnings: [] }
      : { status, errorCode: 'FBX_CONVERSION_FAILED' });
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(ports.resolveCompanions).not.toHaveBeenCalled();
    expect(ports.authorizeSource).not.toHaveBeenCalled();
    expect(ports.requestModelRender).not.toHaveBeenCalled();
  });

  it.each(['model.glb', 'model.fbx'])('preserves URL, companions, authorization and multiview contracts for %s', async (relativeFilePath) => {
    const { ports, render } = harness();
    ports.resolveCompanions.mockReturnValue([{ assetId: 'texture', revisionId: 'texture-revision', relativeFilePath: 'textures/diffuse.png', extension: 'png' }]);
    const job = { ...input(), relativeFilePath, revisionId: 'revision with spaces', views: [[1, 2, 3]] as const };
    await render(job);
    expect(ports.convertFbx).toHaveBeenCalledTimes(relativeFilePath.endsWith('fbx') ? 1 : 0);
    expect(ports.authorizeSource).toHaveBeenCalledTimes(2);
    expect(ports.requestModelRender).toHaveBeenCalledWith(expect.objectContaining({
      format: 'glb',
      renderUrl: relativeFilePath.endsWith('fbx') ? 'super://preview/library/glb' : 'super://source/library/asset?revision=revision%20with%20spaces',
      companionMap: [{ assetId: 'texture', revisionId: 'texture-revision', relativeFilePath: 'textures/diffuse.png', extension: 'png' }],
      sourceAuthorizations: [expect.objectContaining({ assetId: 'asset' }), expect.objectContaining({ assetId: 'texture' })],
      views: [[1, 2, 3]], width: 512, height: 512,
    }), job.signal);
  });

  it('retains typed conversion failure and never authorizes or dispatches it', async () => {
    const { ports, render } = harness(vi.fn(async () => ({ status: 'failed' as const, errorCode: 'FBX_CONVERSION_FAILED' as const, reason: 'fixture' })));
    await expect(render(input())).resolves.toEqual({ status: 'failed', errorCode: 'FBX_CONVERSION_FAILED', reason: 'fixture' });
    expect(ports.requestModelRender).not.toHaveBeenCalled();
    expect(ports.authorizeSource).not.toHaveBeenCalled();
  });

  it('does not dispatch when authorization synchronously cancels the job', async () => {
    const { ports, render } = harness();
    const controller = new AbortController();
    const original = ports.authorizeSource.getMockImplementation()!;
    ports.authorizeSource.mockImplementation((source) => { controller.abort(); return original(source); });
    await expect(render({ ...input(controller.signal), relativeFilePath: 'model.glb' })).rejects.toMatchObject({ name: 'AbortError' });
    expect(ports.requestModelRender).not.toHaveBeenCalled();
  });
});
