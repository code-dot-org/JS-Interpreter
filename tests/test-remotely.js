const fetch = require('node-fetch');
const fs = require('fs');
const yargs = require('yargs');
const ChildProcess = require('child_process');

const TOKEN_CACHE_FILENAME = '.circleci/api-token';

const spawn = (...args) =>
  new Promise((resolve, reject) => {
    ChildProcess.spawn(...args)
      .on('close', resolve)
      .on('error', reject);
  });

const argv = yargs
  .usage(`Usage: $0 <filepath.js>`)
  .help('h')
  .alias('h', 'help')
  .alias('v', 'verbose')
  .boolean('v')
  .describe('timeout', 'How long to wait before failing a test')
  .default('timeout', 6000)

  .describe('circleToken', 'Token for accessing the circleci API')
  .default(
    'circleToken',
    fs.existsSync(TOKEN_CACHE_FILENAME)
      ? fs.readFileSync(TOKEN_CACHE_FILENAME)
      : ''
  )
  .describe('branch', 'the git branch to test')
  .alias('branch', 'b')
  .default(
    'branch',
    ChildProcess.execSync('git describe --contains --all HEAD')
      .toString()
      .trim()
  )
  .describe('revision', 'Which revision to run the tests on.')
  .alias('revision', 'r')
  .default('revision', 'HEAD').argv;

async function fetchOnCircle(path, config = {}) {
  const baseUrl =
    'https://circleci.com/api/v1.1/project/github/code-dot-org/JS-Interpreter';
  const url = `${baseUrl}${path}?circle-token=${argv.circleToken}`;
  const method = config.method || 'GET';
  const body = config.body ? JSON.stringify(config.body) : undefined;
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!config.raw) {
    return response.json();
  }
  return response;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  if (argv.circleToken) {
    fs.writeFileSync(TOKEN_CACHE_FILENAME, argv.circleToken);
  }
  const origin = `origin/${argv.branch}`;
  const revision = ChildProcess.execSync(`git rev-parse ${origin}`)
    .toString()
    .trim();
  const patch = ChildProcess.execSync(`git diff ${origin}`).toString();
  fs.writeFileSync('/tmp/js-interpreter.patch', patch);
  const patchUrl = ChildProcess.execSync(
    `curl -F name=js-interpreter.patch -F file=@/tmp/js-interpreter.patch https://uguu.se/api.php?d=upload-tool`
  ).toString();

  console.log('Starting Circle Run for', argv._.join(' '));
  const build = await fetchOnCircle(`/tree/${argv.branch}`, {
    method: 'POST',
    body: {
      revision,
      build_parameters: {
        TEST_GLOB: argv._.join(' '),
        TIMEOUT: argv.timeout,
        PATCH: patchUrl,
      },
    },
  });
  console.log('Circle Run Started');
  console.log('  See', build.build_url);

  let status = { lifecycle: 'queued' };
  while (status.lifecycle !== 'finished') {
    await wait(5000);
    process.stdout.write('checking build status... ');
    status = await fetchOnCircle(`/${build.build_num}`);
    console.log(status.lifecycle);
  }
  await spawn(
    './node_modules/.bin/js-interpreter-tyrant',
    ['--circleBuild', build.build_num, '--diff'],
    {
      stdio: 'inherit',
    }
  );
}

run();
