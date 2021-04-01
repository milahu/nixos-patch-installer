#!/usr/bin/env node

// nixos patch installer: quickly patch your nixpkgs

// aka: nix-quickfix, patch-your-nix, break-your-nix, nix-overlayfs, nix-channels-overlayfs, ...
// author: milahu, license: CC0-1.0, date: 2021-03-30

// global state
let isVerbose = false;

const commandList = ['start', 'stop', 'diff', 'patch', 'serve'];

function main(argv) {

  //const scriptName = basename(argv[0]);
  const scriptName = 'backend/index.js';

  var args = argv.slice(1);

  if (args[0] == '--verbose') {
    isVerbose = true;
    args.shift();
  }
  const command = args.shift();
  if (!command || !isCommand(command)) return showHelp(scriptName);

  const channelsPathLink = `${process.env.HOME}/.nix-defexpr/channels`;
  // channelsPath is a symlink to /nix/var/nix/profiles/per-user/${userName}/channels
  // the symlink is managed by nix-channel
  const channelsPath = realpath(channelsPathLink);
  if (isVerbose) console.log(`resolved channelsPath: ${channelsPathLink} -> ${channelsPath}`)

  const channelList = readdir(channelsPath).filter(n => n != 'manifest.nix').map(n => ({
    name: n,
    path: realpath(`${channelsPath}/${n}`),
  }));
  if (isVerbose) console.log(`found channels:\n  ${channelList.map(c => `${c.name} -> ${c.path}`).join('\n  ')}`)

  channelList.forEach(channel => {
    const pkgPath = getPkgPath(channel.path);
    const nixpkgsPath = `${pkgPath}/${channel.name}`
    const pkgDir = basename(pkgPath);
    const overlayBase = `/nix/overlay/${pkgDir}`;

    if (channel.name != 'nixpkgs') return; // use only nixpkgs channel
    // nixpkgs channel seems to be used for packages AND modules

    //console.dir({ pkgPath, pkgDir, overlayBase, nixpkgsPath })

    if (command == 'start') {
      startOverlayfs(pkgPath, overlayBase);
    }
    else if (command == 'stop') {
      stopOverlayfs(pkgPath, overlayBase);
    }
    else if (command == 'serve') {
      runServer({ scriptName, args, pkgPath, overlayBase, nixpkgsPath });
    }
    else if (command == 'diff') {
      const tempDir = mkdirTemp(scriptName);
      const { aText, diffText } = handleDiff({ scriptName, command, args, pkgPath, overlayBase, nixpkgsPath, tempDir });
      console.log(diffText);
      fs.rmdirSync(tempDir);
    }
    else if (command == 'patch') {
      const { lowerPath, lowerFile, upperFile, upperFileName, overlayWasActive } =
        commonDiffPatch({ scriptName, command, args, pkgPath, overlayBase, nixpkgsPath });
      if (!overlayWasActive) startOverlayfs(pkgPath, overlayBase);

      const overlayDir = getDir(pkgPath, overlayBase);
      const mergeFile = lowerFile; // limitation of overlayfs (mounted on lowerdir)

      //console.dir({ overlayDir, pkgPath, origdir: pkgPath, overlayBase, nixpkgsPath, lowerPath, channel, });
      copy(upperFile, mergeFile);
    }
  });
}



function handleDiff({ scriptName, command, args, pkgPath, overlayBase, nixpkgsPath, tempDir }) {
  const { lowerPath, lowerFile, upperFile, upperFileName, overlayWasActive } =
    commonDiffPatch({ scriptName, command, args, pkgPath, overlayBase, nixpkgsPath });

  // workaround: we must stop the overlay to see the lower dir
  // since lower dir == merge dir
  // and overlayfs does not yet support bind-mounting the lower dir somewhere else

  if (!upperFile) {
    // compare to old upperFile in overlay
    const lowerFile2 = `${tempDir}/a.lower.txt`;
    const upperFile2 = `${tempDir}/b.merge.txt`;
    if (!overlayWasActive) {
      copy(lowerFile, lowerFile2);

      startOverlayfs(pkgPath, overlayBase);
      copy(lowerFile, upperFile2);
      stopOverlayfs(pkgPath, overlayBase);
    }
    else { // overlayWasActive == true
      copy(lowerFile, upperFile2);

      stopOverlayfs(pkgPath, overlayBase);
      copy(lowerFile, lowerFile2);
      startOverlayfs(pkgPath, overlayBase);
    }

    const lowerLabel = `a/${lowerPath} in ${nixpkgsPath} (overlay off)`;
    const upperLabel = `b/${lowerPath} in ${nixpkgsPath} (overlay on)`;

    const aText = fs.readFileSync(lowerFile2, 'utf8');
    const bText = fs.readFileSync(upperFile2, 'utf8');
    const diffText = exec(['diff', '-u', '--color=always', '--label', lowerLabel, lowerFile2, '--label', upperLabel, upperFile2]);

    fs.unlinkSync(lowerFile2);
    fs.unlinkSync(upperFile2);

    return { aText, bText, diffText };
  }
  else {
    if (overlayWasActive) stopOverlayfs(pkgPath, overlayBase);

    const lowerLabel = `a/${lowerPath} in ${nixpkgsPath}`;
    const upperLabel = `b/${lowerPath} == ${upperFileName}`;

    const aText = fs.readFileSync(lowerFile, 'utf8');
    const diffText = exec(['diff', '-u', '--color=always', '--label', lowerLabel, lowerFile, '--label', upperLabel, upperFile]);

    if (overlayWasActive) startOverlayfs(pkgPath, overlayBase);

    return { aText, diffText };
  }
}

// based on https://techbrij.com/nodejs-traverse-directory-recursively-depth
function findFiles(dirPath, maxDepth=1, depth=0) {
  const dirs = [];
  const files = [];
  let fileList;
  try {
    fileList = fs.readdirSync(dirPath);
  }
  catch (error) {
    //console.dir({ readdirSync_error: error });
    console.log(`readdir error ${error.code}: ${error.path}`);
    // sample: Error: ENOENT: no such file or directory, scandir '/some/invalid/path'
    return [];
  }
  for (let i = 0; i < fileList.length; i++) {
    const name = fileList[i];
    const filepath = `${dirPath}/${name}`;
    if (fs.lstatSync(filepath).isSymbolicLink())
      files.push([ depth, 'l', name, fs.readlinkSync(filepath) ]);
    else if (fs.statSync(filepath).isDirectory()) // recurse
      dirs.push([ depth, 'd', name, ((depth + 2) > maxDepth) ? false : findFiles(filepath, maxDepth, depth+1) ]);
    else
      files.push([ depth, 'f', name ]);
  }
  return dirs.concat(files); // dirs first
}

function runServer({ scriptName, args, pkgPath, overlayBase, nixpkgsPath }) {

  const backendConfig = require("./config.json");

  const express = require('express');
  const fetch = require('node-fetch');
  const path = require('path');

  const htmlOfAnsiModule = require('ansi-to-html');
  const htmlOfAnsiInstance = new htmlOfAnsiModule();
  const htmlOfAnsi = str => htmlOfAnsiInstance.toHtml(str);

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const tempDir = mkdirTemp(scriptName);
  //fs.rmdirSync(tempDir); // TODO cleanup on server exit (rimraf)

  const serverCommands = [ 'list', 'diff', 'patch' ];

  // route handlers

  const installJobs = [];



  app.post('/backend/jobstatus', (req, res) => {
    const jobId = parseInt(req.body.jobId);
    const job = installJobs[jobId];
    if (job)
      res.json({
        ok: 1,
        jobId,
        startTime: job.startTime,
        filesCount: job.filesCount,
        filesDownloaded: job.filesDownloaded,
        downloadCount: job.files?.length,
        filesCompared: job.filesCompared,
        compareUpperCount: job.files?.filter(f => f.upperDiff).length,
        compareLowerCount: job.files?.filter(f => f.lowerDiff).length,
        readyTime: job.readyTime,
      });
    else
      res.json({ ok: 0, why: 'bad job id' });
  });



  app.post('/backend/jobdata', (req, res) => {
    const jobId = parseInt(req.body.jobId);
    const job = installJobs[jobId];
    if (job)
      res.json({ ok: 1, jobId, job });
    else
      res.json({ ok: 0, why: 'bad job id' });
  });



  app.post('/backend/install', async (req, res) => {
    const installUrl = req.body.url;
    console.dir({ installUrl });

    const jobId = installJobs.length;
    installJobs.push({});
    const job = installJobs[jobId];

    job.url = installUrl;
    job.startTime = timestampUtc();

    // finish the request early
    // send a 'job id' back to the frontend
    // so the frontend can poll for the job status
    res.json({ ok: 1, jobId, url: installUrl });

    const match = installUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)$/);
    if (!match) {
      job.ok = 0;
      job.why = 'bad url';
      return;
    };
    const [, owner, repo, pull] = match;
    //console.dir({ owner, repo, pull });

    const fileListUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${pull}/files`;
    const fileListRes = await fetch(fileListUrl);
    const fileList = await fileListRes.json();
    console.log("fileList:");
    //console.dir(fileList);
    job.filesCount = fileList.length;

    //console.dir({ fileList });

    // download all the files!
    console.log(`download ${fileList.length} files ...`)
    for (const file of fileList) {
      const fileRes = await fetch(file.raw_url);
      const fileText = await fileRes.text();
      // TODO handle binary files (or non-utf8 encodings)
      // https://www.npmjs.com/package/node-fetch#plain-text-or-html

      const localPath = `${tempDir}/job/${jobId}/${file.filename}`;
      const localDir = path.dirname(localPath);
      fs.mkdirSync(localDir, { recursive: true });
      fs.writeFileSync(localPath, fileText, 'utf8'); // assert utf8 ...

      if (!job.files) job.files = [];
      job.files.push({
        raw_url: file.raw_url,
        filename: file.filename, // file path in repo. sample: nixos/modules/misc/locate.nix
        status: file.status, // 'modified' (etc) TODO handle 'deleted' or 'removed'
        sha: file.sha,
        patchText: file.patch, // TODO show in frontend + syntax highlight (patch or diff?) (patch = diff with email headers)
        localPath,
        fileText,
      });
    }
    job.filesDownloaded = true;

    console.dir({ job__files: job.files });

    // compare all the files!
    // TODO diff: compare the patched files vs the local files (in upper and lower dir)

    // more copy pasta .... TODO refactor

    // TODO check if the file exists in the upper dir (not merge dir)
    // -> if no, we dont need the upperText and upperDiff

    // TODO also show the patchfile from the pull request (relative to the PR's base repo)

    // compare to the upper files first
    console.log('compare to the upper files')
    startOverlayfs(pkgPath, overlayBase); // make sure we get the upper files
    job.files.forEach((file, fileId) => {
      // refactor!
      const command = 'diff';
      const diffArgs = [
        file.filename, // nixos/relative/path/in/nixpkgs/to/file.txt
        file.localPath, // /tmp/path/to/file.txt
        file.raw_url, // http://github...
      ];
      const { aText, bText, diffText } = handleDiff(
        { scriptName, command, args: diffArgs, pkgPath, overlayBase, nixpkgsPath, tempDir });

      // different:      
      file.upperText = aText;
      //file.upperDiff = diffText;
      file.upperDiff = htmlOfAnsi(diffText);
    });

    // compare to the lower files
    console.log('compare to the lower files')
    stopOverlayfs(pkgPath, overlayBase); // make sure we get the lower files
    job.files.forEach((file, fileId) => {
      // refactor!
      const command = 'diff';
      const diffArgs = [
        file.filename, // nixos/relative/path/in/nixpkgs/to/file.txt
        file.localPath, // /tmp/path/to/file.txt
        file.raw_url, // http://github...
      ];
      const { aText, bText, diffText } = handleDiff(
        { scriptName, command, args: diffArgs, pkgPath, overlayBase, nixpkgsPath, tempDir });
      
      // different:
      file.lowerText = aText;
      //file.lowerDiff = diffText;
      file.lowerDiff = htmlOfAnsi(diffText);
    });

    // assert: overlay is normally on
    startOverlayfs(pkgPath, overlayBase); // make sure we get the upper files

    job.filesCompared = true;

    job.readyTime = timestampUtc();

    console.log(`done after ${job.readyTime - job.startTime} seconds. ready for audit :)`)

    // ready for audit :)
    // wait for the frontend to fetch all the job data

    // TODO garbage collect jobs when too many (avoid out-of-memory) or too old (define 'old')
  });



  app.post('/backend/list', (req, res) => {
    console.dir({ path: req.body.path });
    const path = (req.body.path || '').split('/').filter(d => d != '..').join('/'); // limit access
    // TODO const where = (req.body.path || 'lower'); // lower | upper | merge
    res.json({ ok: 1, path, files: findFiles(`${nixpkgsPath}/${path}`, 1) });
  });



  app.post('/backend/diff', (req, res) => {

    const { a, b, bText } = req.body;
    const command = 'diff';
    const diffArgs = [ a ];
    const bFile = b && (() => {
      const bFile = `${tempDir}/b.temp.txt`;
      // TODO limit file size?
      fs.writeFileSync(bFile, bText, 'utf8');
      diffArgs.push(bFile);
      diffArgs.push(b);
      return bFile;
    })();
    const { aText, bText: bTextRes, diffText } = handleDiff(
      { scriptName, command, args: diffArgs, pkgPath, overlayBase, nixpkgsPath, tempDir });
    if (bFile)
      fs.unlinkSync(bFile);

    res.json({ ok: 1, a, aText, bText: bTextRes, diffHtml: htmlOfAnsi(diffText) });
  });



  app.get('/backend/patch', (req, res) => {
    res.json({ ok: 1 });
    // TODO copy patched file to the overlay merge dir
  });



  // fallback route (catch all)
  app.get(/.*/, (req, res) => {
    res.status(404).send();
  });



  // start server
  const backendUrl = `${backendConfig.protocol}://${backendConfig.host}:${backendConfig.port}`;
  app.listen(backendConfig.port, backendConfig.host, (error) => {
    if (error) console.dir({ express_error: error });
    console.log(`${scriptName} server listening on ${backendUrl}`);
  });
}



function showHelp(scriptName) {
  console.log([
    `usage:`,
    `  ${scriptName} [--verbose] command [args...]`,
    '',
    'commands:',
    '  start  mount the overlay',
    '  stop   unmount the overlay',
    '  diff   compare files',
    '  patch  change files',
    '',
    'command arguments:',
    '  diff   <a> [<b>]',
    '  patch  <a> <b>',
    '    a  original file path, relative to nixpkgs',
    '    b  patched file path',
    '',
    'for more examples run:',
    `  ${scriptName} diff`,
    `  ${scriptName} patch`,
  ].join('\n'));
}

const isCommand = command => new Set(commandList).has(command);

// file path, relative to nixpkgs: nixos/modules/services/networking/firewall.nix
// dir path of local nixpkgs: nixpkgsPath = /nix/store/ac27fzq0gdh5is9navia6d9shgv1bd9s-nixpkgs-20.09/nixpkgs/
function commonDiffPatch({ scriptName, command, args, pkgPath, overlayBase, nixpkgsPath }) {
  const overlayWasActive = isOverlayActive(pkgPath, overlayBase);
  const lowerPath = args[0];
  const upperFile = args[1];
  const upperFileName = args[2] || upperFile;
  if (!lowerPath || (command == 'copy' && !upperFile)) {
    console.log([
      ((command == 'copy')
        ? `usage: ${scriptName} ${command} <lowerPath> <upperFile>`
        : `usage: ${scriptName} ${command} <lowerPath> [<upperFile>]`
      ),
      `  lowerPath is relative to nixpkgs in ${nixpkgsPath}`,
      ((command == 'copy')
        ? '  upperFile is a file'
        : '  upperFile is a file. optional. when empty, compare lower and upper file in the overlay'
      ),
      `samples:`,
      `  ${scriptName} ${command} nixos/modules/services/networking/firewall.nix firewall.patched.nix`,
      (command == 'diff') ? `  ${scriptName} ${command} nixos/modules/services/networking/firewall.nix` : undefined,
    ].join('\n'));
    process.exit(1);
  }
  if (upperFile && !exists(upperFile)) {
    console.log(`no such file: ${upperFile}`);
    process.exit(1);
  }
  const lowerFile = `${nixpkgsPath}/${lowerPath}`;
  if (!exists(lowerFile)) {
    console.log(`no such file: ${lowerFile}`);
    console.log(`lowerPath is relative to nixpkgs in ${nixpkgsPath}`);
    process.exit(1);
  }
  //console.dir({ lowerFile, upperFile });
  return { lowerFile, lowerPath, upperFile, upperFileName, overlayWasActive,  };
}

const os = require('os');
const fs = require('fs');
const cp = require('child_process');

// UTC timestamp (seconds since 1970-01-01)
//const timestampUtc = () => Math.floor((new Date()).getTime() / 1000);
const timestampUtc = () => (new Date()).getTime() / 1000; // float seconds

//const isLink = path => fs.lstatSync(path).isSymbolicLink();
const basename = path => path.split("/").filter(Boolean).slice(-1)[0];
const mkdirTemp = (base = 'temp') => fs.mkdtempSync(`${os.tmpdir()}/${base.replace(/\//g, '--')}-`);

const getPkgPath = subdirPath => subdirPath.split("/").slice(0, 4).join("/");
// -> /nix/store/hash-name-version

const readdir = path => fs.readdirSync(path);
const realpath = path => fs.realpathSync(path);
const exists = path => fs.existsSync(path);
const rename = (a, b) => {
  if (isVerbose) console.log(`rename: ${a} -> ${b}`);
  fs.renameSync(a, b);
};
const mkdir = (path, o={}) => {
  if (o.canExist && exists(path)) {
    if (isVerbose) console.log(`dir exists: ${path}`);
    return;
  }
  if (isVerbose) console.log(`mkdir: ${path}`);
  fs.mkdirSync(path, { recursive: true });
};
const rmdir = path => {
  if (isVerbose) console.log(`rmdir: ${path}`);
  fs.rmdirSync(path);
};
const hardlink = (source, target) => {
  if (exists(target)) {
    if (isVerbose) console.log(`hardlink target exists: ${target}`)
    return;
  };
  if (isVerbose) console.log(`hardlink: ${source} -> ${target}`)
  fs.linkSync(source, target)
};
const symlink = (source, target) => {
  if (exists(target)) {
    if (isVerbose) console.log(`symlink target exists: ${target}`)
    return;
  };
  if (isVerbose) console.log(`symlink: ${source} -> ${target}`)
  fs.symlinkSync(source, target)
};
const copy = (source, target) => {
  if (exists(target))
    if (isVerbose) console.log(`overwrite: ${source} -> ${target}`)
  else
    if (isVerbose) console.log(`copy: ${source} -> ${target}`)
  fs.copyFileSync(source, target);
};
const exec = cmd => {
  if (Array.isArray(cmd)) {
    if (isVerbose) console.log(`exec: ${cmd.join(' ')}`); // TODO pretty-print escaped args
    return cp.spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', maxbuffer: Infinity }).stdout;
  }
  if (isVerbose) console.log(`exec: ${cmd}`);
  return cp.execSync(cmd, { encoding: 'utf8', maxbuffer: Infinity });
};
const getDir = (origdir, overlayBase) => {
  const sep = (origdir == overlayBase) ? '.overlayfs.' : '/';
  return {
    orig: origdir,
    lower: origdir,
    merge: origdir,
    mergeLink: `${overlayBase}${sep}merge`,
    upper: `${overlayBase}${sep}upper`,
    work: `${overlayBase}${sep}work`,
  };
};

const isMounted = mountPoint => {
  const mountList = exec('mount').trim().split('\n').map(l => l.split(' ')).filter(l => l[4] == 'overlay');
  return mountList.find(l => l[2] == mountPoint);
};

function isOverlayActive(origdir, overlayBase) {
  if (!exists(origdir)) throw `error: orig dir missing: ${origdir}`;
  if (!overlayBase) throw `error: argument overlayBase is required`;
  const dir = getDir(origdir, overlayBase);
  return isMounted(dir.merge);
}

function startOverlayfs(origdir, overlayBase) {
  if (!exists(origdir)) throw `error: orig dir missing: ${origdir}`;
  if (!overlayBase) throw `error: argument overlayBase is required`;
  const dir = getDir(origdir, overlayBase);

  if (isMounted(dir.merge)) {
    console.log(`already mounted: ${dir.merge}`);
    return;
  }

  mkdir(dir.upper, { canExist: true });
  mkdir(dir.work, { canExist: true });

  const mountOptions = [
    `lowerdir=${dir.lower}`,
    `upperdir=${dir.upper}`,
    `workdir=${dir.work}`,
  ].join(',');
  exec(`mount -t overlay overlay -o ${mountOptions} ${dir.merge}`);
  symlink(dir.merge, dir.mergeLink);
  // lowerdir is shadowed = not accessible :(

  console.log(`success: mounted overlayfs on ${dir.merge}`);

  /*
  console.log([
    'success: mounted overlayfs:',
    `  dir.orig:  ${dir.orig}`,
    `  dir.merge: ${dir.merge}`,
    `  dir.lower: ${dir.lower}`,
    `  dir.upper: ${dir.upper}`,
    `  dir.work:  ${dir.work}`,
  ].join('\n'));
  */
}

function stopOverlayfs(origdir, overlayBase) {
  if (!exists(origdir)) throw `error: orig dir missing: ${origdir}`;
  if (!overlayBase) throw `error: argument overlayBase is required`;
  const dir = getDir(origdir, overlayBase);
  if (!isMounted(dir.merge)) {
    console.log(`not mounted: ${dir.merge}`);
    return;
  }
  if (!exists(dir.lower)) throw `error: lower dir missing: ${dir.lower}`;
  if (!exists(dir.upper)) throw `error: upper dir missing: ${dir.upper}`;
  if (!exists(dir.work)) throw `error: upper dir missing: ${dir.work}`;
  if (!exists(dir.merge)) throw `error: merge dir missing: ${dir.merge}`;

  exec(`umount ${dir.merge}`);
  console.log(`success: stopped overlayfs on ${dir.merge}`);
}



// finally!
main(process.argv.slice(1)); // arg0 is node
