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

function validateGenerationId(generation) {
  const value = String(generation || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Invalid prompt gallery publication generation');
  }
  return value;
}

function generationFromFileName(fileName) {
  if (typeof fileName !== 'string' || !fileName.endsWith('.json')) return null;
  const generation = fileName.slice(0, -'.json'.length);
  try {
    return validateGenerationId(generation);
  } catch {
    return null;
  }
}

function createPromptGalleryStore(dataDir, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const platform = options.platform || process.platform;
  const root = path.resolve(dataDir);
  const sourcesDir = path.join(root, 'sources');
  const publicationsDir = path.join(root, 'publications');
  const publishedPath = path.join(root, 'published.json');
  const manifestPath = path.join(root, 'manifest.json');

  function fsyncDirectoryBestEffort(directoryPath) {
    if (platform === 'win32') return;
    let directoryDescriptor;
    try {
      directoryDescriptor = fsImpl.openSync(directoryPath, 'r');
      try {
        fsImpl.fsyncSync(directoryDescriptor);
      } catch {
        // The filesystem operation is already logically committed.
      }
    } catch {
      // Some filesystems do not support opening directories for fsync.
    } finally {
      if (directoryDescriptor !== undefined) {
        try {
          fsImpl.closeSync(directoryDescriptor);
        } catch {
          // Directory durability remains best-effort after the commit point.
        }
      }
    }
  }

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
      fsyncDirectoryBestEffort(path.dirname(targetPath));
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

  function publicationGenerationPath(generation) {
    return path.join(publicationsDir, `${validateGenerationId(generation)}.json`);
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
    loadPublishedGeneration(generation) {
      return readJson(publicationGenerationPath(generation));
    },
    savePublishedGeneration(generation, publication) {
      writeJson(publicationGenerationPath(generation), publication);
    },
    listPublishedGenerations() {
      let entries;
      try {
        entries = fsImpl.readdirSync(publicationsDir, { withFileTypes: true });
      } catch (error) {
        if (error?.code === 'ENOENT') return [];
        throw error;
      }
      return entries
        .filter(entry => entry.isFile())
        .map(entry => generationFromFileName(entry.name))
        .filter(Boolean)
        .sort();
    },
    deletePublishedGeneration(generation) {
      const targetPath = publicationGenerationPath(generation);
      let targetStat;
      try {
        targetStat = fsImpl.lstatSync(targetPath);
      } catch (error) {
        if (error?.code === 'ENOENT') return false;
        throw error;
      }
      if (!targetStat.isFile()) return false;
      fsImpl.unlinkSync(targetPath);
      fsyncDirectoryBestEffort(publicationsDir);
      return true;
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
