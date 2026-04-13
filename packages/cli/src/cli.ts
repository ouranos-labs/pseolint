#!/usr/bin/env node
export async function runCli(args: string[] = process.argv.slice(2)): Promise<number> {
  const source = args[0] ?? ".";
  console.log(`pseolint scaffold CLI ready. source=${source}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().then((code) => {
    process.exit(code);
  });
}
