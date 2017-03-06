#!/usr/bin/env node
const path = require('path');
const yargs = require('yargs');
const fs = require('fs');
const execSync = require('child_process').execSync;
const spawn = require('child_process').spawn;
const chalk = require('chalk');


const TESTS_DIRECTORY = path.resolve(__dirname, 'test262');
const DEFAULT_TEST_RESULTS_FILE = 'test-results-new.json';

const argv = yargs
  .usage(`Usage: $0 [options] [${DEFAULT_TEST_RESULTS_FILE}]`)
  .alias('d', 'diff')
  .describe('d', 'diff against existing test results')
  .alias('r', 'run')
  .describe('r', 'generate new test results')
  .alias('t', 'threads')
  .describe('t', '# of threads to use')
  .nargs('t', 1)
  .default('t', 4)
  .help('h')
  .alias('h', 'help')
  .argv;

const RESULTS_FILE = argv._[0] || path.resolve(__dirname, DEFAULT_TEST_RESULTS_FILE);

function downloadTestsIfNecessary() {
  if (!fs.existsSync(TESTS_DIRECTORY)) {
    console.log("Downloading test262 test suite");
    execSync(`git clone https://github.com/tc39/test262.git --depth 1 ${TESTS_DIRECTORY}`);
  }
}

function runTests(outputFilePath) {
  downloadTestsIfNecessary();
  console.log("running tests...");
  const command = spawn(
    'node_modules/.bin/test262-harness',
    '--hostType js-interpreter --hostPath ./bin/run.js --test262Dir tests/test262 -t 4 -r json tests/test262/test/language/**/*.js'.split(/\s/)
  );
  const outputFile = fs.openSync(outputFilePath, 'w');
  fs.appendFileSync(outputFile, '[\n');
  let count = 0;
  command.stdout.on('data', data => {
    const lines = data.toString().split('\n')
    lines.forEach(line => {
      if (line[0] === ',') {
        line = line.slice(1);
      }
      if (line[0] === '{') {
        let test;
        try {
          test = JSON.parse(line);
        } catch (e) {
          console.warn("couldn't parse", line);
          return;
        }
        const color = test.result.pass ? chalk.red : chalk.green;
        const description = (test.attrs.description || test.file).trim().replace('\n', ' ')
        console.log(`${count+1} ${color(description)}`);
        const prefix = count > 0 ? ',\n' : '';
        const simplifiedTestResult = {
          file: test.file,
          attrs: test.attrs,
          result: test.result,
        };
        fs.appendFileSync(outputFile, prefix + JSON.stringify(simplifiedTestResult, null, 2));
        count++;
      }
    });
  });
  command.stderr.on('data', data => console.warn(data));
  return new Promise(resolve => {
    command.on('close', code => {
      fs.appendFileSync(outputFile, '\n]');
      fs.closeSync(outputFile);
      resolve(code);
    });
  });
}

function readResultsFromFile(filename) {
  return require(path.resolve(filename));
}

function getKeyForTest(test) {
  return [test.file, test.attrs.description].join(' ');
}

function getResultsByKey(results) {
  const byKey = {}
  results.forEach(test => byKey[getKeyForTest(test)] = test);
  return byKey;
}


function processTestResults() {
  const results = readResultsFromFile(RESULTS_FILE);

  let total = {
    es6: 0,
    es5: 0,
    other: 0,
  };
  let passed = {
    es6: 0,
    es5: 0,
    other: 0,
  };
  let percent = {};


  results.forEach(test => {
    const type = test.attrs.es5id ? 'es5' :
                 test.attrs.es6id ? 'es6' :
                 'other';
    total[type]++;
    if (test.result.pass) {
      passed[type]++;
    }
    percent[type] = Math.floor(passed[type] / total[type] * 100);
  });

  console.log(`\
Results:
  es5: ${passed.es5}/${total.es5} (${percent.es5}%) passed
  es6: ${passed.es6}/${total.es6} (${percent.es6}%) passed
`);

  if (argv.diff) {
    const oldResults = readResultsFromFile(
      typeof argv.diff === 'string' ? argv.diff : path.resolve(__dirname, 'test-results.json')
    );
    const resultsByKey = getResultsByKey(oldResults);
    const testsThatDiffer = [];
    results.forEach(newTest => {
      const oldTest = resultsByKey[getKeyForTest(newTest)];
      if (!oldTest) {
        testsThatDiffer.push({
          oldTest,
          newTest,
          message: 'This test is new',
        });
        return;
      }
      if (oldTest.result.pass !== newTest.result.pass) {
        testsThatDiffer.push({
          oldTest,
          newTest,
          message: `old: ${oldTest.result.pass}   new: ${newTest.result.pass}`
        });
        return;
      }
      console.log(getKeyForTest(newTest), 'is the same');
    });

    testsThatDiffer.forEach(({oldTest, newTest, message}) => {
      console.log(newTest.attrs.description);
      console.log('  ', message);
    });

    console.log(`${testsThatDiffer.length} tests differ from before`);
  }
}


if (argv.run) {
  runTests(RESULTS_FILE).then(processTestResults);
} else {
  processTestResults()
}
