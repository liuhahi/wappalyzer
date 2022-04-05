#!/usr/bin/env node
const { spawn } = require('child_process')
const fs = require('fs')
const { dirname } = require('path')
const path = require('path')
const downloadFile = require('./helper')
const Wappalyzer = require('./driver')
const args = process.argv.slice(2)

let SCANTIST_IMPORT_URL = 'https://api-staging.scantist.io/ci-scan/' // staging env
let SCANTISTTOKEN = '11041986-abf0-4de4-a217-315746bb5f34' // Dini token

const options = {}

let url
let arg

const aliases = {
  a: 'userAgent',
  b: 'batchSize',
  d: 'debug',
  t: 'delay',
  h: 'help',
  D: 'maxDepth',
  m: 'maxUrls',
  p: 'probe',
  P: 'pretty',
  r: 'recursive',
  w: 'maxWait',
  n: 'noScripts',
  N: 'noRedirect',
  e: 'extended',
}

while (true) {
  // eslint-disable-line no-constant-condition
  arg = args.shift()
  if (!arg) {
    break
  }

  const matches = /^-?-([^=]+)(?:=(.+)?)?/.exec(arg)

  if (matches) {
    const key =
      aliases[matches[1]] ||
      matches[1].replace(/-\w/g, (_matches) => _matches[1].toUpperCase())
    // eslint-disable-next-line no-nested-ternary
    const value = matches[2]
      ? matches[2]
      : args[0] && !args[0].startsWith('-')
      ? args.shift()
      : true

    options[key] = value
  } else {
    url = arg
  }
}

if (!url || options.help) {
  process.stdout.write(`Usage:
  wappalyzer <url> [options]

Examples:
  wappalyzer https://www.example.com
  node cli.js https://www.example.com -r -D 3 -m 50
  docker wappalyzer/cli https://www.example.com --pretty

Options:
  -b, --batch-size=...     Process links in batches
  -d, --debug              Output debug messages
  -t, --delay=ms           Wait for ms milliseconds between requests
  -h, --help               This text
  --html-max-cols=...      Limit the number of HTML characters per line processed
  --html-max-rows=...      Limit the number of HTML lines processed
  -D, --max-depth=...      Don't analyse pages more than num levels deep
  -m, --max-urls=...       Exit when num URLs have been analysed
  -w, --max-wait=...       Wait no more than ms milliseconds for page resources to load
  -p, --probe              Perform a deeper scan by performing additional requests and inspecting DNS records
  -P, --pretty             Pretty-print JSON output
  --proxy=...              Proxy URL, e.g. 'http://user:pass@proxy:8080'
  -r, --recursive          Follow links on pages (crawler)
  -a, --user-agent=...     Set the user agent string
  -n, --no-scripts         Disabled JavaScript on web pages
  -N, --no-redirect        Disable cross-domain redirects
  -e, --extended           Output additional information
`)

  process.exit(1)
}

;(async function () {
  const wappalyzer = new Wappalyzer(options)
  try {
    // check token
    if (options.token) {
      SCANTISTTOKEN = options.token
    }
    // check env
    if (options.env == 'prod') {
      SCANTIST_IMPORT_URL = 'https://api.scantist.io/ci-scan/'
    }

    await wappalyzer.init()
    const site = await wappalyzer.open(url)

    const results = await site.analyze()

    const dependencyObj = {}
    console.log('results count:', results.technologies.length);
    results.technologies.map((t) => {
      console.log('row:', t);
      dependencyObj[t.name] = t.version ? t.version : '0'
    })
    const websiteName = Object.keys(results.urls)[0]
    const packageJsonFile = {
      name: websiteName,
      version: '0.1.0',
      dependencies: dependencyObj,
    }
    let websiteFolderName = websiteName.replace('https://', '')
    websiteFolderName = websiteFolderName.replace('http://', '')
    websiteFolderName = websiteFolderName.split('/')[0]
    const appDir = dirname(require.main.filename)
    const jarLocation = appDir.replace(
      'src/drivers/npm',
      'scantist-bom-detect.jar'
    )
    // create results folder for scans if not exist
    const resultsFolder = appDir.replace('src/drivers/npm', 'results')
    if (!fs.existsSync(resultsFolder)) {
      fs.mkdirSync(resultsFolder)
    }
    // create website folder if not exist
    const workspacePath = path.join(resultsFolder, websiteFolderName) + '/'
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath)
    }
    // download bom detector
    try {
      const result = await downloadFile(jarLocation)
      console.log(result)
    } catch (err) {
      console.log(err)
    }
    // write website json file
    fs.writeFile(
      path.join(workspacePath, 'package.json'),
      JSON.stringify(packageJsonFile),
      'utf8',
      function (err) {
        if (err) {
          console.log('An error occured while writing JSON Object to File.')
          return console.log(err)
        }
        console.log('JSON file has been saved.')
        console.log('env values:', SCANTISTTOKEN, SCANTIST_IMPORT_URL)
        const child = spawn(
          'java',
          ['-jar', jarLocation, '-working_dir', workspacePath, '--debug'],
          {
            env: {
              ...process.env,
              SCANTISTTOKEN,
              SCANTIST_IMPORT_URL,
            },
            cwd: workspacePath,
            detached: true,
          }
        )
        console.log('show spawn', child.spawnargs)
        child.stdout.on('data', (data) => {
          console.log(`stdout: ${data}`);
        });
        
        child.stderr.on('data', (data) => {
          console.error(`stderr: ${data}`);
        });
        
        child.on('close', (code) => {
          console.log(`child process exited with code ${code}`);
        });        
      }
    )

    await wappalyzer.destroy()

    process.exit(0)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error)

    await wappalyzer.destroy()

    process.exit(1)
  }
})()

// const dependencyTree = {
//   scan_name: websiteName,
//   scan_version: '',
//   repo_url: 'N.A.',
//   scan_timestamp: new Date().toJSON(),
//   scan_buildCreationInfo: {
//     rootDir: '/',
//     repo_name: '',
//     build_time: '',
//     commit_sha: '',
//     branch: 'master',
//     repo_url: 'N.A.',
//     scan_source: 'CI',
//     scan_type: 'source_code',
//     SBD_version: '2022/01/12',
//   },
//   scan_filesOfInterest: [],
//   projects: [
//     {
//       artifact_id: websiteName,
//       group_id: websiteName,
//       version: '0.1.0',
//       level: 0,
//       type: 'user_module',
//       package_manager: {
//         package_manager: 'Yarn',
//         language: 'JavaScript',
//         working_dir: '/Users/scantist/Project/test-bom',
//         running_mode: 'normal',
//         characteristic_files: [
//           {
//             file_name: 'yarn.lock',
//             file_path: 'yarn.lock',
//           },
//           {
//             file_name: 'package.json',
//             file_path: 'package.json',
//           },
//         ],
//       },
//       dependencies,
//     },
//   ],
// }
