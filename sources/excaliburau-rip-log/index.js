/**
 * Appends one JSON line per finished rip to a local log file.
 *
 * Settings (plugins/<id>/settings.json):
 *   logPath - absolute path to .jsonl file (default: <pluginDir>/rip-log.jsonl)
 *   enabled - default true
 */
const fs = require('fs');
const path = require('path');

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

module.exports = {
  name: 'Rip Log',
  version: '1.0.0',

  activate(ctx) {
    ctx.log('Rip Log activated');

    if (ctx.settings.get('enabled') === null) {
      ctx.settings.set('enabled', true);
    }

    const defaultLog = path.join(ctx.pluginPath || process.cwd(), 'rip-log.jsonl');
    if (ctx.settings.get('logPath') === null) {
      ctx.settings.set('logPath', defaultLog);
    }

    const onDownloadComplete = (data) => {
      if (ctx.settings.get('enabled') === false) return;

      const logPath = String(ctx.settings.get('logPath') || defaultLog).trim() || defaultLog;
      const entry = {
        completedAt: new Date().toISOString(),
        jobId: data?.jobId || null,
        downloadName: data?.downloadName || null,
        downloadUrl: data?.downloadUrl || null,
        artist: data?.artist || '',
        album: data?.album || '',
        title: data?.title || '',
        trackCount: data?.trackCount ?? null,
        size: data?.size ?? null,
        format: data?.format || null,
        mediaMode: data?.mediaMode || null,
        source: data?.source || null,
      };

      try {
        ensureParentDir(logPath);
        fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
        ctx.log(`Logged rip → ${logPath}`);
      } catch (err) {
        ctx.log(`Failed to write rip log: ${err.message || err}`);
      }
    };

    ctx.events.on('download-complete', onDownloadComplete);
    ctx._cleanup = () => ctx.events.off('download-complete', onDownloadComplete);
  },

  deactivate(ctx) {
    ctx.log('Rip Log deactivated');
    if (ctx._cleanup) ctx._cleanup();
  },
};
