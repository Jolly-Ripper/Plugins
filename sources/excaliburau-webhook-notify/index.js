/**
 * POSTs a JSON payload to a webhook URL when a rip finishes.
 * Works with n8n, Slack Incoming Webhooks, Zapier, Make, etc.
 *
 * Settings (plugins/<id>/settings.json):
 *   webhookUrl - required destination URL
 *   enabled    - default true
 *   template   - "generic" | "slack" (default generic)
 */
const https = require('https');
const http = require('http');
const { URL } = require('url');

function postJson(urlString, body) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch {
      reject(new Error('Invalid webhookUrl'));
      return;
    }

    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    const transport = parsed.protocol === 'http:' ? http : https;
    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
          'User-Agent': 'JollyRipper-WebhookNotify/1.0.0',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, text });
          } else {
            reject(new Error(`Webhook HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Webhook request timeout'));
    });
    req.write(payload);
    req.end();
  });
}

function buildBody(data, template) {
  const base = {
    event: 'download-complete',
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
    completedAt: new Date().toISOString(),
  };

  if (template === 'slack') {
    const label = [base.artist, base.album || base.title || base.downloadName].filter(Boolean).join(' — ');
    return {
      text: `Jolly Ripper finished: ${label || 'download'} (${base.trackCount ?? '?'} tracks)`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Jolly Ripper* finished a rip\n*${label || base.downloadName || 'download'}*\nTracks: ${base.trackCount ?? 'n/a'} · Format: ${base.format || 'n/a'}`,
          },
        },
      ],
    };
  }

  return base;
}

module.exports = {
  name: 'Webhook Notify',
  version: '1.0.0',

  activate(ctx) {
    ctx.log('Webhook Notify activated');

    if (ctx.settings.get('enabled') === null) {
      ctx.settings.set('enabled', true);
    }
    if (ctx.settings.get('template') === null) {
      ctx.settings.set('template', 'generic');
    }
    if (ctx.settings.get('webhookUrl') === null) {
      ctx.settings.set('webhookUrl', '');
      ctx.log('Set webhookUrl in this plugin\'s settings.json to enable notifications');
    }

    const onDownloadComplete = async (data) => {
      if (ctx.settings.get('enabled') === false) return;

      const webhookUrl = String(ctx.settings.get('webhookUrl') || '').trim();
      if (!webhookUrl) {
        ctx.log('Skipping webhook — webhookUrl not set');
        return;
      }

      const template = ctx.settings.get('template') || 'generic';
      try {
        const result = await postJson(webhookUrl, buildBody(data, template));
        ctx.log(`Webhook OK (${result.status})`);
      } catch (err) {
        ctx.log(`Webhook failed: ${err.message || err}`);
      }
    };

    ctx.events.on('download-complete', onDownloadComplete);
    ctx._cleanup = () => ctx.events.off('download-complete', onDownloadComplete);
  },

  deactivate(ctx) {
    ctx.log('Webhook Notify deactivated');
    if (ctx._cleanup) ctx._cleanup();
  },
};
