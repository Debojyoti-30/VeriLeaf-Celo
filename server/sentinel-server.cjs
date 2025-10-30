// sentinel-server.cjs - moved to repo root/server
const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const bodyParser = require('body-parser');

// Load environment variables from repo root .env and override existing envs
dotenv.config({ override: true, path: path.resolve(__dirname, '..', '.env') });

// Log masked environment diagnostics (no secrets printed)
const _loadedClientId = process.env.SENTINEL_CLIENT_ID || null;
const _maskedClientId = _loadedClientId ? `${_loadedClientId.slice(0, 6)}...${_loadedClientId.slice(-4)}` : 'NOT-SET';
const _secretSet = !!process.env.SENTINEL_CLIENT_SECRET;
console.log(`Starting sentinel-server; cwd=${process.cwd()}; SENTINEL_CLIENT_ID=${_maskedClientId}; SENTINEL_CLIENT_SECRET set=${_secretSet}`);

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

const PORT = process.env.PORT || 4000;

// Helper to get OAuth token from Sentinel Hub
async function getToken(clientId, clientSecret) {
  // First attempt: send client_id and client_secret in form body (common)
  let resp = await fetch('https://services.sentinel-hub.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (resp.ok) {
    const j = await resp.json();
    return j.access_token;
  }

  // If the first attempt failed (401), some deployments accept HTTP Basic auth instead.
  // Try again using Authorization: Basic <base64(client:secret)> with only grant_type in body.
  const txt = await resp.text();
  console.warn(`Initial token exchange failed: ${resp.status} ${txt}`);

  if (resp.status === 401) {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    resp = await fetch('https://services.sentinel-hub.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });

    const txt2 = await resp.text();
    if (!resp.ok) {
      throw new Error(`token request failed (basic-auth fallback): ${resp.status} ${txt2}`);
    }
    const j2 = JSON.parse(txt2);
    return j2.access_token;
  }

  // Otherwise throw the original error
  throw new Error(`token request failed: ${resp.status} ${txt}`);
}

// Create process request payload
function makePayload(geojson, fromIso, toIso, width = 512, height = 512) {
  return {
    input: {
      bounds: { geometry: geojson.geometry },
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: { from: `${fromIso}T00:00:00Z`, to: `${toIso}T23:59:59Z` },
            maxCloudCoverage: 20,
          },
        },
      ],
    },
    output: {
      width,
      height,
      responses: [{ identifier: 'default', format: { type: 'image/jpeg' } }],
    },
    evalscript: `
      // true color
      function setup() { return { input: ["B04", "B03", "B02"], output: { bands: 3 } }; }
      function evaluatePixel(sample) { return [sample.B04, sample.B03, sample.B02]; }
    `,
  };
}

app.post('/api/sentinel/process', async (req, res) => {
  try {
    const { geojson, beforeDate, afterDate, windowDays = 7 } = req.body;

    if (!geojson || !beforeDate || !afterDate) {
      return res.status(400).json({ error: 'geojson, beforeDate and afterDate required' });
    }

    const CLIENT_ID = process.env.SENTINEL_CLIENT_ID;
    const CLIENT_SECRET = process.env.SENTINEL_CLIENT_SECRET;
    if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).json({ error: 'Sentinel credentials not configured on server' });

    const token = await getToken(CLIENT_ID, CLIENT_SECRET);

    const fromBefore = new Date(beforeDate);
    const toBefore = new Date(fromBefore);
    toBefore.setDate(toBefore.getDate() + windowDays);

    const fromAfter = new Date(afterDate);
    const toAfter = new Date(fromAfter);
    toAfter.setDate(toAfter.getDate() + windowDays);

    const payloadBefore = makePayload(geojson, fromBefore.toISOString().slice(0, 10), toBefore.toISOString().slice(0, 10));
    const payloadAfter = makePayload(geojson, fromAfter.toISOString().slice(0, 10), toAfter.toISOString().slice(0, 10));

    const processOne = async (payload, label) => {
      try {
        const r = await fetch('https://services.sentinel-hub.com/api/v1/process', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!r.ok) {
          const text = await r.text();
          throw new Error(`process failed: ${r.status} ${text}`);
        }
        const ab = await r.arrayBuffer();
        const buf = Buffer.from(ab);
        // write the buffer to disk for local debugging and convenience
        const fs = require('fs');
        const outDir = path.join(__dirname, 'output');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        // write deterministic filenames so the latest analysis is always at before.jpg / after.jpg
        let filename;
        if (label === 'before') filename = 'before.jpg';
        else if (label === 'after') filename = 'after.jpg';
        else filename = `img_${Date.now()}.jpg`;
        const outPath = path.join(outDir, filename);
        // also write a copy to project root for easy access (optional)
        const rootCopyPath = path.join(__dirname, '..', filename);
        try {
          fs.writeFileSync(outPath, buf);
          console.log(`Wrote process image to ${outPath}`);
          // attempt to write a root copy (best-effort)
          try { fs.writeFileSync(rootCopyPath, buf); console.log(`Also wrote copy to ${rootCopyPath}`); } catch (_) { /* ignore */ }
        } catch (wfErr) {
          console.error('Failed writing image to disk', wfErr && wfErr.message ? wfErr.message : wfErr);
        }
        return { b64: buf.toString('base64'), path: outPath };
      } catch (err) {
        console.error('processOne error', err && err.message ? err.message : err);
        throw err;
      }
    };

    const [beforeRes, afterRes] = await Promise.all([processOne(payloadBefore, 'before'), processOne(payloadAfter, 'after')]);
    // beforeRes/afterRes are objects { b64, path }
    res.json({
      before: beforeRes.b64,
      after: afterRes.b64,
      beforePath: beforeRes.path,
      afterPath: afterRes.path,
    });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: String(err) });
  }
});

// Diagnostic endpoint
app.post('/api/sentinel/check-token', async (req, res) => {
  try {
    const CLIENT_ID = process.env.SENTINEL_CLIENT_ID;
    const CLIENT_SECRET = process.env.SENTINEL_CLIENT_SECRET;
    if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).json({ error: 'Sentinel credentials not configured on server' });
    try {
      await getToken(CLIENT_ID, CLIENT_SECRET);
      return res.json({ ok: true, message: 'token request succeeded' });
    } catch (e) {
      return res.status(502).json({ ok: false, error: String(e) });
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: String(err) });
  }
});

// Serve the latest saved before/after images
app.get('/api/sentinel/image/:which', (req, res) => {
  try {
    const which = req.params.which;
    if (which !== 'before' && which !== 'after') return res.status(400).send('unknown image');
    const fs = require('fs');
    const filePath = path.join(__dirname, 'output', `${which}.jpg`);
    if (!fs.existsSync(filePath)) return res.status(404).send('not found');
    res.sendFile(filePath);
  } catch (err) {
    console.error('image serve error', err && err.stack ? err.stack : err);
    res.status(500).send('server error');
  }
});

try {
  app.listen(PORT, () => console.log(`✅ Sentinel server listening on port ${PORT}`));
} catch (err) {
  console.error('Failed to start sentinel server', err && err.stack ? err.stack : err);
  process.exit(1);
}
