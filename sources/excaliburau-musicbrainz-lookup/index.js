/**
 * Opens MusicBrainz release search when a rip finishes.
 *
 * Settings (plugins/<id>/settings.json):
 *   autoOpen  - open browser on each rip (default true)
 *   searchType - MusicBrainz type: release | recording | artist (default release)
 */
const https = require('https');

function buildQuery(data) {
  const artist = String(data?.artist || '').trim();
  const album = String(data?.album || data?.title || '').trim();
  const name = String(data?.downloadName || '').replace(/\.(zip|mp3|flac|m4a|wav)$/i, '').trim();

  if (artist && album) return `${artist} ${album}`;
  if (album) return album;
  if (artist) return artist;
  return name;
}

function musicBrainzSearchUrl(query, searchType) {
  const params = new URLSearchParams({
    query,
    type: searchType || 'release',
    method: 'indexed',
  });
  return `https://musicbrainz.org/search?${params.toString()}`;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'JollyRipper-MusicBrainzLookup/1.0.0 (https://github.com/Jolly-Ripper)',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error('MusicBrainz request timeout'));
    });
  });
}

module.exports = {
  name: 'MusicBrainz Lookup',
  version: '1.0.0',

  activate(ctx) {
    ctx.log('MusicBrainz Lookup activated');

    if (ctx.settings.get('autoOpen') === null) {
      ctx.settings.set('autoOpen', true);
    }
    if (ctx.settings.get('searchType') === null) {
      ctx.settings.set('searchType', 'release');
    }

    const onDownloadComplete = async (data) => {
      const query = buildQuery(data);
      if (!query) {
        ctx.log('No title/artist to search');
        return;
      }

      const searchType = ctx.settings.get('searchType') || 'release';
      const url = musicBrainzSearchUrl(query, searchType);
      ctx.log(`MusicBrainz search: ${query}`);

      try {
        const apiUrl =
          `https://musicbrainz.org/ws/2/${encodeURIComponent(searchType)}` +
          `?query=${encodeURIComponent(query)}&fmt=json&limit=3`;
        const result = await fetchJson(apiUrl);
        const key = searchType === 'release' ? 'releases' : searchType === 'artist' ? 'artists' : 'recordings';
        const hits = Array.isArray(result?.[key]) ? result[key] : [];
        if (hits.length) {
          ctx.log(
            `Top hits: ${hits
              .map((h) => h.title || h.name || h.id)
              .filter(Boolean)
              .join(' | ')}`,
          );
        } else {
          ctx.log('No MusicBrainz hits (opening search page anyway)');
        }
      } catch (err) {
        ctx.log(`Lookup failed: ${err.message || err}`);
      }

      if (ctx.settings.get('autoOpen') !== false) {
        await ctx.shell.openExternal(url);
      }
    };

    ctx.events.on('download-complete', onDownloadComplete);
    ctx._cleanup = () => ctx.events.off('download-complete', onDownloadComplete);
  },

  deactivate(ctx) {
    ctx.log('MusicBrainz Lookup deactivated');
    if (ctx._cleanup) ctx._cleanup();
  },
};
