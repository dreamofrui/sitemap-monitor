#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const deploymentUrl = process.env.DEPLOYMENT_URL;
const password = process.env.DASHBOARD_PASSWORD;
const sourceId = process.env.VERIFY_SOURCE_ID ? Number(process.env.VERIFY_SOURCE_ID) : null;
const baseUrl = deploymentUrl ? new URL(deploymentUrl) : null;
if (baseUrl) baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, '');

if (!deploymentUrl || !password) {
  console.error('DEPLOYMENT_URL and DASHBOARD_PASSWORD are required');
  process.exitCode = 1;
} else if (sourceId !== null && (!Number.isInteger(sourceId) || sourceId < 1)) {
  console.error('VERIFY_SOURCE_ID must be a positive integer');
  process.exitCode = 1;
} else {
  verify().catch((error) => {
    console.error(`Deployment verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}

async function request(path, options = {}) {
  const url = new URL(path, baseUrl);
  return fetch(url, { redirect: 'manual', ...options });
}

async function assertStatus(response, expected, label) {
  if (response.status !== expected) {
    const body = await response.text();
    throw new Error(`${label}: expected ${expected}, received ${response.status}${body ? ` (${body.slice(0, 200)})` : ''}`);
  }
}

async function verify() {
  const workflow = readFileSync(new URL('../.github/workflows/check-sitemaps.yml', import.meta.url), 'utf8');
  if (!/cron:\s*['"]0 \*\/4 \* \* \*['"]/.test(workflow) || !/^\s+workflow_dispatch:\s*$/m.test(workflow)) {
    throw new Error('GitHub Actions workflow is missing the four-hour schedule or manual trigger');
  }
  console.log('OK GitHub Actions declares the four-hour schedule and manual trigger');

  const unauthenticated = await request('/api/sources');
  await assertStatus(unauthenticated, 401, 'unauthenticated API read');
  console.log('OK unauthenticated API access is rejected');

  const page = await request('/');
  if (![301, 302, 307, 308].includes(page.status) || !page.headers.get('location')?.includes('/login')) {
    throw new Error(`protected page did not redirect to /login (status ${page.status})`);
  }
  console.log('OK dashboard redirects unauthenticated visitors to /login');

  const signin = await request('/api/auth/signin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password })
  });
  await assertStatus(signin, 204, 'password sign-in');
  const setCookie = signin.headers.get('set-cookie') || '';
  const cookie = setCookie.match(/sitemap_monitor_session=[^;]+/)?.[0];
  if (!cookie || !/httponly/i.test(setCookie) || !/samesite=lax/i.test(setCookie) || !/secure/i.test(setCookie)) {
    throw new Error('sign-in did not return the expected HTTP-only session cookie');
  }
  console.log('OK deployment password creates an HTTP-only session');

  const headers = { cookie };
  const sourcesResponse = await request('/api/sources', { headers });
  await assertStatus(sourcesResponse, 200, 'authenticated source read');
  const sources = await sourcesResponse.json();
  if (!Array.isArray(sources)) throw new Error('authenticated source read did not return an array');
  console.log(`OK authenticated source read returned ${sources.length} source(s)`);

  for (const path of ['/api/signals', '/api/discoveries']) {
    const response = await request(path, { headers });
    await assertStatus(response, 200, `authenticated ${path} read`);
    console.log(`OK ${path} is available to the authenticated operator`);
  }

  if (sourceId !== null) {
    const scan = await request('/api/scan', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ id: sourceId })
    });
    await assertStatus(scan, 200, 'manual scan');
    const result = await scan.json();
    if (result?.error) throw new Error(`manual scan returned an error: ${result.error}`);

    const refreshedResponse = await request('/api/sources', { headers });
    await assertStatus(refreshedResponse, 200, 'source persistence read');
    const refreshed = (await refreshedResponse.json()).find((source) => Number(source.id) === sourceId);
    if (!refreshed) throw new Error(`source ${sourceId} was not returned after the scan`);
    if (refreshed.lastScanStatus !== 'succeeded') {
      throw new Error(`source ${sourceId} did not persist a successful scan (status ${refreshed.lastScanStatus})`);
    }
    console.log(`OK source ${sourceId} completed and persisted a successful scan`);
  }

  console.log('Deployment verification completed');
}
