#!/usr/bin/env node
import { main } from "../src/cli.js";

const result = main(process.argv.slice(2));
if (result instanceof Promise) {
  result.then((code) => {
    process.exitCode = code;
  });
} else {
  process.exitCode = result;
}
