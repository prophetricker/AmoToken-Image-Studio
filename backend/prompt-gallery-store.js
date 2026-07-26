const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

function validateSourceId(sourceId) {
  const value = String(sourceId || '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
    throw new Error('Invalid prompt gallery source id');
  }
  return value;
}

function createPromptGalleryStore(dataDir, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const root = path.resolve(dataDir);
  const sourcesDir = path.join(root, 'sources');
  const publishedPath = path.join(root, 'published.json');
  const manifestPath = path.join(root, 'manifest.json');

  function readJson(targetPath) {
    try {
      return JSON.parse(fsImpl.readFileSync(targetPath, 'utf8'));
    } catch {
      return null;
    }
  }

  function writeJson(targetPath, value) {
    fsImpl.mkdirSync(path.dirname(targetPath), { recursive: true });
    const suffix = `${process.pid}.${Date.now()}.${randomBytes(6).toString('hex')}.tmp`;
    const temporaryPath = `${targetPath}.${suffix}`;
    let fileDescriptor;
    try {
      fileDescriptor = fsImpl.openSync(temporaryPath, 'wx', 0o600);
      fsImpl.writeFileSync(fileDescriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      fsImpl.fsyncSync(fileDescriptor);
      fsImpl.closeSync(fileDescriptor);
      fileDescriptor = undefined;
      fsImpl.renameSync(temporaryPath, targetPath);
    } catch (error) {
      if (fileDescriptor !== undefined) {
        try {
          fsImpl.closeSync(fileDescriptor);
        } catch {
          // Preserve the original write error.
        }
      }
      try {
        fsImpl.rmSync(temporaryPath, { force: true });
      } catch {
        // Preserve the original write error.
      }
      throw error;
    }
  }

  function sourcePath(sourceId) {
    return path.join(sourcesDir, `${validateSourceId(sourceId)}.json`);
  }

  return {
    loadSource(sourceId) {
      return readJson(sourcePath(sourceId));
    },
    saveSource(sourceId, records) {
      writeJson(sourcePath(sourceId), records);
    },
    loadPublished() {
      return readJson(publishedPath);
    },
    savePublished(records) {
      writeJson(publishedPath, records);
    },
    loadManifest() {
      return readJson(manifestPath);
    },
    saveManifest(manifest) {
      writeJson(manifestPath, manifest);
    },
  };
}

module.exports = { createPromptGalleryStore };
