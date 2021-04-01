# nixos patch installer

Install patches from Github pull requests directly to your NixOS machine

aka: nix-quickfix, patch-your-nix, break-your-nix, nix-store-overlayfs, ...

aka: [happy aprils fools](http://web.archive.org/web/20210401091638/https://stackoverflow.com/questions?thekey), everyone! :)  
but no, this project is not a joke, only the first release (birthday) is an april first

[//]: # ( concept / overview )

```txt
            ┌───────────────┐
            │    Github     ├─────┐
            └───────────────┘     │
N                                 │
i  ┌─     ──── content.js ─────   │
x  │                              │
O  │        ┌───────────────┐     │
S  │        │   Extension   │
   │    U   └───────────────┘     T
P  │              Link            C
a  │    s   ┌───────────────┐     P
t  │        │   Frontend    │
c  │    e   └───────────────┘     │
h  │               TCP            │
   │    r   ┌───────────────┐     │
I  │        │    Backend    ├─────┘
n  │        └───────────────┘
s  │
t  │      ──── Unix Socket ────
a  │
l  │        ┌───────────────┐
l  │        │     Core      │
e  │    R   └───────────────┘
r  └─
        o   ┌───────────────┐
            │   OverlayFS   │
        o   └───────────────┘

        t   ┌───────────────┐
            │   Nix Store   │
            └───────────────┘
```

[//]: # ( diagram generated with https://asciiflow.com/ )
[//]: # ( another ascii art editor: https://textik.com/ )

(for now, backend and core are [the same script](backend/index.js),  
but they can be separated, and they should be separated, for better security.)

## status

this is a minimal implementation ~~of the backend~~

working:

* start/stop the overlayfs
* compare files
* apply patches via the backend CLI
* view patches and sources in the frontend GUI (more or less pretty)
* browse files in local nixpkgs in the frontend GUI

missing:

* apply patches via the frontend
* prettier frontend

## motivation

[//]: # ( i originally spammed this to the freenode nixos IRC channel )
[//]: # ( on 2021-03-30 08:57:12 CEST )

.... so i had this idea of an "AUR for nixos"  
(nixos user repository? similar to the arch-linux AUR) ..

right now, we can "overlay" packages and modules in our configuration.nix file ..  
but this process is too "manual" for my taste.

also, replacing existing modules requires adding (for example)  
`disabledModules = [ "services/networking/firewall.nix" ];`  
to the patched module file,  
and dependencies like `services/networking/helpers.nix` must be copied.  
refs:  
https://discourse.nixos.org/t/5282/5 # overlay modules  
https://nixos.wiki/wiki/Overlays # overlay packages  

what im looking for is a "point and click" solution,  
where the tooling does the boring job of overlaying my local nixpkgs,  
and i can focus on the much more important job of auditing the code changes.  
(as a side-effect, this could make auditing+testing patches from github much simpler.)

what i imagine is a [backend](backend/index.js) using the linux overlayfs,  
to physically "overlay" the patched files over the locally installed files.  
this backend runs a local http server, to where a [browser extension](extension/) can send new patches.  
the browser extension [adds a "install patch" button](extension/src/content.js) to every PR in the github nixpkgs repo.  
when i click "install patch", [i see the diff](frontend/src/App.jsx) versus my local file,  
so i can audit the code change, and explicitly "agree to install this patch".

(in case someone is super-bored and has some hours of free time,  
feel free to implement my concept, maybe youre faster than me : D )

[//]: # ( 2 days later, i have a 50% working prototype. )
[//]: # ( the frontend UI needs some more work, )
[//]: # ( and the backend is missing the 'patch' function, )
[//]: # ( where the patched files are written to disk )

### more motivation

'simply use the latest version of nixpkgs' is not desired  
cos we do not want to spend hours and hours compiling programs,  
instead, we want to use the binary cache by default,  
and only compile (use uncached versions) when necessary.

## design goals

"overlays" should be persistent  
so we go to the lowest level of nix: the /nix/store  
and we mount our overlayfs over the nixos and nixpkgs packages  
maybe there is a better way, but ... this one works :)

we want a space-efficient solution  
so generating the 'merged dirs' with file copy  
(and bloating /nix/store) is not desired

avoid typescript and other compilers.  
we want a solution that is quickly editable (hackable).  
this also rules out Rust for the backend / core

use devtools with Hot Module Reload.  
i use svelte (not solidJS) for the browser extension,  
cos i could not make work the solidJS-tooling for browser extensions.  
(HMR hangs in infinite loops ...)

be small and fast. avoid heavy solutions like the Atom framework

## cloc status (count lines of code)

* 440 loc in [backend/index.js](backend/index.js)
* 300 loc in [frontend/src/App.jsx](frontend/src/App.jsx)
* 300 loc in [frontend/src/App.jsx](frontend/src/App.jsx)
* 40 loc in [extension/src/content.js](extension/src/content.js)
* 40 loc in [extension/src/content.js](extension/src/content.js)
* 80 loc in [extension/src/popup/App.jsx](extension/src/popup/App.jsx)

1200 loc in total (happy auditing!)

hopefully this can be reduced by using more npm libraries

## install

so you have read all my 1200 lines of code  
and now you want to run my code.  
(or you just say [shut up and take my money](https://knowyourmeme.com/memes/shut-up-and-take-my-money))  
(or rather 'shut up and takeover my computer' ...)

anyway, here is the

### how to use

```bash
git clone https://github.com/milahu/nixos-patch-installer.git
cd nixos-patch-installer

cd extension
npm install
npm run build
# in your browser: menu -> extensions
# drag and drop the zip file from nixos-patch-installer/extension/release/
# or in dev mode, 'open unpacked' from nixos-patch-installer/extension/dist/
cd ..

cd backend
npm install
cd ..
# maybe change the TCP port in backend/config.json
sudo node backend/index.js serve & # the fun part! (dont trust me, read my code.)

cd frontend
npm install
npm run start
# now the frontend should be at http://localhost:3000 or similar
```

in your browser: open https://github.com/NixOS/nixpkgs/pulls

select a pull request

in the navigation bar (Conversation, Commits, Checks, Files changed),  
there should be a new button "Install Patch".

click that button, and a new tab should open with the "frontend".  
there you should see the diffs  
between the remote version and your local version of the changed files.  
(for now, the frontend shows only the first file.)

### actually patch the local files

if you want to test the 'patch' function,  
for now you must use the backend CLI:

```txt
sudo node backend/index.js diff

usage: backend/index.js diff <lowerPath> [<upperFile>]
  lowerPath is relative to nixpkgs in /nix/store/ac27fzq0gdh5is9navia6d9shgv1bd9s-nixpkgs-20.09/nixpkgs
  upperFile is a file. optional. when empty, compare lower and upper file in the overlay
samples:
  backend/index.js diff nixos/modules/services/networking/firewall.nix firewall.patched.nix
  backend/index.js diff nixos/modules/services/networking/firewall.nix
```

```txt
sudo node backend/index.js patch

usage: backend/index.js patch <lowerPath> [<upperFile>]
  lowerPath is relative to nixpkgs in /nix/store/ac27fzq0gdh5is9navia6d9shgv1bd9s-nixpkgs-20.09/nixpkgs
  upperFile is a file. optional. when empty, compare lower and upper file in the overlay
samples:
  backend/index.js patch nixos/modules/services/networking/firewall.nix firewall.patched.nix
```

## todo

* rewrite the backend http server with [koa](https://github.com/koajs/koa) (with [vite](https://github.com/vitejs/vite), koa works better than express)
* (optionally) manage overlay files with git repo
* show full diff between lower and upper files (run command `diff` without arguments)
* minimize root access! only needed for mount, umount, write to merge dir.  
  -> factor-out a "core backend", with strong separation (http interface for IPC)  
  the high-risk code should be as small as possible (make auditing easy)  
  only the core-backend should run with root privileges, and allow password/2FA protection
* rewrite the extension with [svelte](https://github.com/kyrelldixon/svelte-tailwind-extension-boilerplate). (better tooling for HMR = Hot Module Reload)  
  we just dont (yet) have a good bundler template for solidJS + browser extensions
* allow to annotate files, and publish comments to the github pull request (via backend and [octonode](https://github.com/pksunkara/octonode))
* show only relevant/effective changes, ignore syntax changes and comments (diff noise).  
  compare derivations, for example with [nix-diff](https://github.com/Gabriel439/nix-diff)
* cache downloads in the backend (derive unique hash from the 'install url'?)
* find a 'html mergetool'? (compare files side by side)
* show full history of file, between local version and patched version  
  usually there are more commits than those in the pull request (since last stable release)

## notes

problem:  
when lowerdir == mergedir, then we have no more access to the lowerdir  
bind-mount does not help, hardlink dont work on dirs (copy-recursive is stupid)  
workaround:  
to compare files, we must unmount the overlayfs

note. to edit the overlay, we must edit only the merge dir  
when we edit the upper dir, then changes only show after remount

local nix channels are managed in  
https://github.com/NixOS/nix/blob/master/src/nix-channel/nix-channel.cc  
nix-channel --add url [name]  
nix-channel --list

* nixos https://nixos.org/channels/nixos-unstable
* nixpkgs https://nixos.org/channels/nixos-unstable

```cc
// https://github.com/NixOS/nix/blob/master/src/libutil/util.cc

nixDefExpr = home + "/.nix-defexpr";
createDirs(nixDefExpr); // line 574
auto channelLink = nixDefExpr + "/channels";
replaceSymlink(profile, channelLink); // line 614
```

user-environment is generated by nix-env  
https://github.com/NixOS/nix/blob/master/src/nix-env/nix-env.cc

the frontend server is a proxy to the backend server (see [frontend/vite.config.js](frontend/vite.config.js)),  
so both servers appear on the same host and port,  
otherwise our browser would block http requests to the backend

is this useful?  
"show what packages and versions were added and removed between two closures"  
https://nixos.org/manual/nix/unstable/command-ref/new-cli/nix3-store-diff-closures.html

"nix show-derivation - show the contents of a store derivation"  
https://nixos.org/manual/nix/unstable/command-ref/new-cli/nix3-show-derivation.html

security: run node.js as root?  
https://security.stackexchange.com/questions/129350/node-js-rest-server-running-as-root
-> solution: compartmentalize. extract low-level backend to a "core" (TODO)

## license

license is [CC Zero 1.0](LICENSE) = zero limits + zero warranty
