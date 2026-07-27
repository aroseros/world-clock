import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const output = 'world-clock-extension-v1.0.0.zip';
const releasePaths = [
  'manifest.json',
  'background',
  'popup',
  'sidepanel',
  'onboarding',
  'shared',
  'data',
  'assets',
  'README.md',
];

rmSync(output, { force: true });
const result = spawnSync('zip', ['-r', output, ...releasePaths, '-x', '*.DS_Store'], {
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

const listing = spawnSync('unzip', ['-Z1', output], { encoding: 'utf8' });
if (listing.error) throw listing.error;
if (listing.status !== 0) process.exit(listing.status || 1);
const forbidden = listing.stdout.split('\n').filter((entry) => (
  /(^|\/)(node_modules|tests|scripts|\.git|\.superpowers)(\/|$)/.test(entry)
));
if (forbidden.length) {
  rmSync(output, { force: true });
  throw new Error(`Release archive contains development files: ${forbidden.join(', ')}`);
}
console.log(`Created ${output}`);
