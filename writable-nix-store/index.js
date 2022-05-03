#! /usr/bin/env node

// writable nix store
// author: milahu
// license: MIT
// date: 2022-05-03

// based on nixos-patch-installer/backend/index.js
// this is a more general version
// to get write-access to all files in /nix/store

// note: all write operations go to the upper dir
// so every new derivation or store-path goes to upper
// and is lost on umount

// global state
let isVerbose = false;

const commandList = ['start', 'stop'];

function main(argv) {
  const scriptName = 'writable-nix-store/index.js';
  var args = argv.slice(1); // argv0 is index.js

  if (args[0] == '--verbose') {
    isVerbose = true;
    args.shift();
  }

  const command = args.shift();
  if (!command || !isCommand(command)) return showHelp(scriptName);

  const storePath = '/nix/store';
  const overlayBase = `/nix/overlay-store`;

  if (command == 'start') {
    startOverlayfs(storePath, overlayBase);
  }
  else if (command == 'stop') {
    stopOverlayfs(storePath, overlayBase);
  }
}



function showHelp(scriptName) {
  console.log([
    `usage:`,
    `  sudo ${scriptName} [--verbose] command`,
    '',
    'commands:',
    '  start  mount the overlay',
    '  stop   unmount the overlay',
  ].join('\n'));
}

const isCommand = command => new Set(commandList).has(command);

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

function getOverlayDirs(lowerDir, overlayBase) {
  const sep = (lowerDir == overlayBase) ? '.overlayfs.' : '/';
  // note: lower == mount
  // this will shadow the lower dir
  // -> bind-mount lower to lowerBak
  return {
    lower: lowerDir,
    mount: lowerDir,
    lowerBak: `${overlayBase}${sep}lower`,
    upper: `${overlayBase}${sep}upper`,
    work: `${overlayBase}${sep}work`,
  };
}

function isMountedOverlay(mountPoint) {
  // overlayfs:
  // overlay on /nix/store type overlay (...)
  // bind-mount:
  // /dev/sda1 on /nix/overlay-store/lower type ext4 (ro,noatime,nodiratime,data=ordered)
  const mountList = exec('mount').trim().split('\n').map(l => l.split(' ')).filter(l => l[4] == 'overlay');
  // TODO use /proc/self/mountinfo?
  /*
  if (isVerbose) {
    console.log(`isMountedOverlay: mountList:`);
    console.log(JSON.stringify(mountList, null, 2));
  }
  */
  return mountList.find(l => l[2] == mountPoint);
};

function isMountedBind(mountPoint) {
  // overlayfs:
  // overlay on /nix/store type overlay (...)
  // bind-mount:
  // /dev/sda1 on /nix/overlay-store/lower type ext4 (ro,noatime,nodiratime,data=ordered)
  // TODO regex
  const mountList = fs.readFileSync('/proc/self/mountinfo', 'utf8').trim().split('\n').map(l => l.split(' '));
  /*
  if (isVerbose) {
    console.log(`isMountedBind: mountList:`);
    console.log(JSON.stringify(mountList, null, 2));
  }
  */
  return mountList.find(l => l[4] == mountPoint);
};

function isOverlayActive(lowerDir, overlayBase) {
  if (!exists(lowerDir)) throw `error: lowerDir missing: ${lowerDir}`;
  if (!overlayBase) throw `error: overlayBase is required`;
  const overlay = getOverlayDirs(lowerDir, overlayBase);
  return isMountedOverlay(overlay.mount);
}

function startOverlayfs(lowerDir, overlayBase) {
  if (!exists(lowerDir)) throw `error: lowerDir missing: ${lowerDir}`;
  if (!overlayBase) throw `error: overlayBase is required`;
  const overlay = getOverlayDirs(lowerDir, overlayBase);

  if (isMountedOverlay(overlay.mount)) {
    console.log(`already mounted: ${overlay.mount}`);
    return;
  }

  mkdir(overlay.upper, { canExist: true });
  mkdir(overlay.work, { canExist: true });
  mkdir(overlay.lowerBak, { canExist: true });

  // TODO print the "before" mounts. mount | grep store

  // https://superuser.com/questions/1314003/how-can-i-access-the-original-files-the-lowerdir-of-an-overlay-mounted-on-the
  exec(`mount --bind ${overlay.mount} ${overlay.lowerBak}`);
  exec(`mount --make-private ${overlay.lowerBak}`);

  const mountOptions = [
    `lowerdir=${overlay.lower}`,
    `upperdir=${overlay.upper}`,
    `workdir=${overlay.work}`,
  ].join(',');
  exec(`mount -t overlay overlay -o ${mountOptions} ${overlay.mount}`);

  // opaque (non-transparent) upper dirs: https://superuser.com/questions/1553610/possible-to-do-overlay-like-fs-where-dirs-in-the-upper-layer-completely-overshad

  console.log(`success: mounted overlayfs on ${overlay.mount}`);

  console.log([
    'success: mounted overlayfs:',
    `  overlay.mount: ${overlay.mount}`,
    `  overlay.lower: ${overlay.lower}`,
    `  overlay.lowerBak: ${overlay.lowerBak}`,
    `  overlay.upper: ${overlay.upper}`,
    `  overlay.work:  ${overlay.work}`,
  ].join('\n'));
}

function stopOverlayfs(lowerDir, overlayBase) {
  if (!exists(lowerDir)) throw `error: orig dir missing: ${lowerDir}`;
  if (!overlayBase) throw `error: argument overlayBase is required`;
  const overlay = getOverlayDirs(lowerDir, overlayBase);
  if (isMountedOverlay(overlay.mount)) {
    // need "--lazy" to fix "umount: /nix/store: target is busy."
    // https://stackoverflow.com/a/19969471/10440128
    exec(`umount --lazy -t overlay ${overlay.mount}`);
    console.log(`success: stopped overlayfs on ${overlay.mount}`);
  }
  else {
    console.log(`not mounted: ${overlay.mount}`);
  }
  if (isMountedBind(overlay.lowerBak)) {
    // need "--lazy" to fix "umount: /nix/store: target is busy."
    // https://stackoverflow.com/a/19969471/10440128
    exec(`umount --lazy ${overlay.lowerBak}`);
    console.log(`success: unmounted lowerBak from ${overlay.lowerBak}`);
  }
  else {
    console.log(`not mounted: ${overlay.lowerBak}`);
  }
}



// finally!
main(process.argv.slice(1)); // arg0 is node
