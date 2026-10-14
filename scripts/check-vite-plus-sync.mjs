// vite-plus pins its own Vite core, and pnpm-workspace.yaml aliases `vite` to that core through
// the catalog. A Dependabot bump that moves one without the other must fail CI, not auto-merge.
import { readFileSync } from 'node:fs';

const workspace = readFileSync('pnpm-workspace.yaml', 'utf8');
const plus = workspace.match(/^ {2}vite-plus: (\S+)$/m)?.[1];
const core = workspace.match(/^ {2}vite: npm:@voidzero-dev\/vite-plus-core@(\S+)$/m)?.[1];
const installed = JSON.parse(readFileSync('node_modules/vite-plus/package.json', 'utf8'))
  .dependencies.vite;

console.log({ plus, core, installed });
if (!plus || plus !== core || installed !== `npm:@voidzero-dev/vite-plus-core@${core}`) {
  console.error('vite-plus and the vite catalog alias are out of sync. Run `vp migrate` to align.');
  process.exit(1);
}
