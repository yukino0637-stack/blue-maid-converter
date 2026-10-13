// Run OFD in a fresh process: dependency fontkit registration is process-global.
const fs = require('node:fs/promises');
(async () => {
  const [input, output, fontDir] = process.argv.slice(2);
  const bytes = await require('@miconvert/ofd-to-pdf').convert(await fs.readFile(input), { fontDir, silent: true });
  await fs.writeFile(output, bytes);
})().catch(() => { process.exitCode = 1; });
