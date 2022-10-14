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

const commandList = ['start', 'stop', 'status'];

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
  else if (command == 'status') {
    statusOverlayfs(storePath, overlayBase);
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
const path = require('path');
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
  // note: hide == mount
  // hide is shadowed by mount
  // -> bind-mount hide to lower
  return {
    hide: lowerDir,
    mount: lowerDir,
    //lower: `${overlayBase}${sep}lower`,
    lower: path.join('/a', lowerDir), // example: /a/nix/store
    //upper: `${overlayBase}${sep}upper`,
    upper: path.join('/b', lowerDir), // example: /b/nix/store
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

  mkdir(overlay.upper, { canExist: true });
  mkdir(overlay.work, { canExist: true });
  mkdir(overlay.lower, { canExist: true });

  // TODO print the "before" mounts. mount | grep store

  if (isMountedBind(overlay.lower)) {
    console.log(`already mounted: ${overlay.lower}`);
  }
  else {
  // https://superuser.com/questions/1314003/how-can-i-access-the-original-files-the-lowerdir-of-an-overlay-mounted-on-the
  exec(`mount --bind ${overlay.mount} ${overlay.lower}`);
  exec(`mount --make-private ${overlay.lower}`);
  }

  if (isMountedOverlay(overlay.mount)) {
    console.log(`already mounted: ${overlay.mount}`);
  }
  else {
  const mountOptions = [
    `lowerdir=${overlay.hide}`,
    `upperdir=${overlay.upper}`,
    `workdir=${overlay.work}`,
    // fix error: stale file handle
    // https://bbs.archlinux.org/viewtopic.php?id=265312
    'index=off',
    'metacopy=off',
  ].join(',');
  exec(`mount -t overlay overlay -o ${mountOptions} ${overlay.mount}`);
  //console.log(`success: mounted overlayfs on ${overlay.mount}`);
  console.log([
    'success: mounted overlayfs:',
    `  overlay.hide:  ${overlay.hide}`,
    `  overlay.mount: ${overlay.mount}`,
    `  overlay.work:  ${overlay.work}`,
    `  overlay.lower: ${overlay.lower}`,
    `  overlay.upper: ${overlay.upper}`,
  ].join('\n'));
  }

  // opaque (non-transparent) upper dirs: https://superuser.com/questions/1553610/possible-to-do-overlay-like-fs-where-dirs-in-the-upper-layer-completely-overshad

  console.log('disabling nixos-rebuild. stop the overlay to run nixos-rebuild');
  if (!fs.existsSync('/run/current-system/sw/bin/.nixos-rebuild--disabled')) {
    rename('/run/current-system/sw/bin/nixos-rebuild', '/run/current-system/sw/bin/.nixos-rebuild--disabled');
  }
  else {
  // here we can patch nixos-rebuild, because the overlay is already mounted.
  // nixos-rebuild lives in
  // /run/current-system/sw -> /nix/store/ *-system-path
  // so the patched nixos-rebuild goes to /b/nix/store
  const nixosRebuildDummy = [
    '#! /usr/bin/env bash',
    '',
    "cat <<'EOF'",
    'nixos-rebuild was disabled by writable-nix-store.js',
    '',
    'the original file is in /run/current-system/sw/bin/.nixos-rebuild--disabled',
    '',
    'nixos-rebuild is the one command',
    'that you do *not* want to run',
    'while the overlay is active',
    '',
    'if you do run `nixos-rebuild switch`',
    'and then stop the overlay, your system is broken,',
    'because many symlink targets have moved',
    'from /nix/store to /b/nix/store.',
    'then you need a hard reboot,',
    'and boot a previous generation of your nixos config',
    '',
    'to run nixos-rebuild, first stop the overlay by running',
    `sudo node ${process.argv[1]} stop`,
    '',
    'to manually stop the overlay, you can run',
    `sudo umount --lazy -t overlay ${overlay.mount}`,
    `sudo umount --lazy ${overlay.lower}`,
    'EOF',
  ].join('\n') + '\n';
  fs.writeFileSync('/run/current-system/sw/bin/nixos-rebuild', nixosRebuildDummy, 'utf8');
  fs.chmodSync('/run/current-system/sw/bin/nixos-rebuild', 0o555); // chmod +x
  }
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
  if (isMountedBind(overlay.lower)) {
    // need "--lazy" to fix "umount: /nix/store: target is busy."
    // https://stackoverflow.com/a/19969471/10440128
    exec(`umount --lazy ${overlay.lower}`);
    console.log(`success: unmounted lower from ${overlay.lower}`);
  }
  else {
    console.log(`not mounted: ${overlay.lower}`);
  }
  /*
  not needed. the patched nixos-rebuild is now in /b/nix/store
  if (!fs.existsSync('/run/current-system/sw/bin/nixos-rebuild--disabled')) {
    console.log('already enabled: nixos-rebuild');
  }
  else {
    console.log('enabling nixos-rebuild');
    rename('/run/current-system/sw/bin/nixos-rebuild--disabled', '/run/current-system/sw/bin/nixos-rebuild');
  }
  */
}



function statusOverlayfs(lowerDir, overlayBase) {
  const overlay = getOverlayDirs(lowerDir, overlayBase);
  console.log('overlay ' + (isMountedOverlay(overlay.mount) ? 'on' : 'off'));
  console.log('bind ' + (isMountedBind(overlay.lower) ? 'on' : 'off'));
}



// finally!
main(process.argv.slice(1)); // arg0 is node
