<img align="left" src="extension/src/images/nixos.svg" width="48">

# nixos patch installer

From Github pull requests, install patches directly to your NixOS machine

aka: nix-quickfix, patch-your-nix, break-your-nix, nix-store-overlayfs, ...

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

working

* start/stop the overlayfs
* compare files
* apply patches via the backend CLI
* view patches and sources in the frontend GUI (more or less pretty)
* browse files in local nixpkgs in the frontend GUI

missing

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

## cloc status

* 440 loc in [backend/index.js](backend/index.js)
* 300 loc in [frontend/src/App.jsx](frontend/src/App.jsx)
* 300 loc in [frontend/src/App.jsx](frontend/src/App.jsx)
* 40 loc in [extension/src/content.js](extension/src/content.js)
* 40 loc in [extension/src/content.js](extension/src/content.js)
* 80 loc in [extension/src/popup/App.jsx](extension/src/popup/App.jsx)

1200 lines-of-code in total (happy auditing!)

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
```

this should open the frontend at http://localhost:3000 or similar.  
in the browser extension popup, set the 'backend URL' to that URL

in your browser: open https://github.com/NixOS/nixpkgs/pulls

select a pull request

in the navigation bar (Conversation, Commits, Checks, Files changed),  
there should be a new button "<img src="extension/src/images/nixos.svg" width="12" /> Install Patch".

click that button, and a new tab should open with the "frontend".  
there you should see the diffs  
between the remote version and your local version of the changed files.  
(for now, the frontend shows only the first file.)

### manual workflow

* select the file to patch (file explorer for nixpkgs lower dir)
* upload the patched file
* compare patched file with files from lower dir (and upper dir, if exists)
* allow to apply patch = save file to upper dir ("are you sure?")

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
* add a mock backend so we can show a live demo of the frontend
* cleanup names: diffText vs diffHtml vs diffAnsi
* allow to enter file path manually (relative to nixpkgs)
* list lower or upper files
* future: show git history of upper files
* prettier file browser

### review helper

implement a semi-automatic review process, according to ...

[reviewing contributions](https://nixos.org/manual/nixpkgs/stable/#chap-reviewing-contributions):  
"The Nixpkgs project receives a fairly high number of contributions via GitHub pull requests.  
Reviewing and approving these is an important task and a way to contribute to the project."

[nix.useSandbox](https://nixos.org/manual/nixos/stable/options.html#opt-nix.useSandbox):  
"If set, Nix will perform builds in a sandboxed environment that it will set up automatically for each build.  
This prevents impurities in builds by disallowing access to dependencies outside of the Nix store  
by using network and mount namespaces in a chroot environment.  
This is enabled by default even though it has a possible performance impact  
due to the initial setup time of a sandbox for each build.  
It doesn't affect derivation hashes,  
so changing this option will not trigger a rebuild of packages."

PR template:

###### Things done
* [ ]  Tested using sandboxing ([nix.useSandbox](https://nixos.org/nixos/manual/options.html#opt-nix.useSandbox) on NixOS, or option `sandbox` in [`nix.conf`](https://nixos.org/nix/manual/#sec-conf-file) on non-NixOS linux)
* Built on platform(s)
  * [ ]  NixOS
  * [ ]  macOS
  * [ ]  other Linux distributions
* [ ]  Tested via one or more NixOS test(s) if existing and applicable for the change (look inside [nixos/tests](https://github.com/NixOS/nixpkgs/blob/master/nixos/tests))
* [ ]  Tested compilation of all pkgs that depend on this change using `nix-shell -p nixpkgs-review --run "nixpkgs-review wip"`
* [ ]  Tested execution of all binary files (usually in `./result/bin/`)
* [ ]  Determined the impact on package closure size (by running `nix path-info -S` before and after)
* [ ]  Ensured that relevant documentation is up to date
* [ ]  Fits [CONTRIBUTING.md](https://github.com/NixOS/nixpkgs/blob/master/.github/CONTRIBUTING.md).

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
https://github.com/NixOS/nix/blob/master/src/libutil/util.cc

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

## related

* [Support flake references to patches (nix issue 3920)](https://github.com/NixOS/nix/issues/3920)
   * ""Support patching nixpkgs" which is meant to support users who track a specific branch of nixpkgs (like nixpkgs-unstable or some release branch) but you would like to apply some unmerged pull requests or some other patches to that revision. This is really common flow for linux users in general. What people currently do is fork nixpkgs, create a branch based on your desired upstream branch and cherry-pick the commits you need on top of that branch. Then everytime you need to upgrade nixpkgs you rebase your branch on the latest upstream branch that you're tracking. IMHO a kinda consuming process if you just want a few patches."
   * "cherry-pick patches against Nixpkgs"
* [Support patching nixpkgs (nixpkgs patch 59990)](https://github.com/NixOS/nixpkgs/pull/59990)
   * "Easy to downstream changes: You can pick patches from unstable to apply to a stable version."
   * "Easy to upstream changes: Changes you make are done as patches (e.g. instead of overrides), so you can easily convert them into a pull request."
   * "You don't have to maintain an internal fork of nixpkgs."
   * "I would like a declarative description of a publicly available version of nixpkgs and a list of publicly available patches. That way I can share this declarative description with collaborators who can each arrive at the same copy of nixpkgs without sharing it directly."
   * "The problem with maintaining such a list of patches is that you have to resolve any conflicts manually, e.g. if you try to update the base Nixpkgs version. Whereas with `git rebase`, you get a more-or-less friendly way to resolve conflicts."
   * "I agree with @edolstra that nixpkgs source trees should be managed by outer program. Eventually, in future, whenever someone comes to do that..."
   * "Then everytime you need to upgrade nixpkgs you rebase your branch on the latest upstream branch that you're tracking. This process works but is a bit involved and somewhat untransparent." - "@P-E-Meunier could this be a case where [Pijul](https://pijul.com/manual/why_pijul.html) could help? As a way to add/substract a set of changes on top of a frequently updated repository."
* [Pijul](https://pijul.com/manual/why_pijul.html) Version Control System
  * merge conflicts are better resolved than with git (and others)
  * tracks changes - git tracks versions
  * "The reason for the counter-intuitive behaviour in Git is that Git runs a heuristic algorithm called three-way merge or diff3, which extends diff to two “new” versions instead of one. Note, however, that diff has multiple optimal solutions, and the same change can be described equivalently by different diffs. While this is fine for diff (since the patch resulting from diff has a unique interpretation), it is ambiguous in the case of diff3 and might lead to arbitrary reshuffling of files."
  * "Pijul for Git/Mercurial/SVN/… users: The main difference between Pijul and Git (and related systems) is that Pijul deals with changes (or patches), whereas Git deals only with snapshots (or versions)."
  * "There are many advantages to using changes. First, changes are the intuitive atomic unit of work. Moreover, changes can be merged according to formal axioms that guarantee correctness in 100% of cases, whereas commits have to be /stitched together based on their contents, rather than on the edits that took place/. This is why in these systems, conflicts are often painful, as there is no real way to solve a conflict once and for all (for example, Git has the rerere command to try and simulate that in some cases)."
* [Flake: patch inputs?](https://discourse.nixos.org/t/flake-patch-inputs/10854)
  * "What exactly do you want to patch?" - "Effektively the source tree of the underlying flake itself. In practical terms, I ultimately desire to have a dirt cheap, elegant and quick way of pulling in (several!) Pull Requests (for the most time) without the need to fork and build an aggregated branch manually."
* [nixui](https://github.com/matejc/nixui), a "Graphical UI for Nix/NixOS" (5 years old, abandoned) ([screenshots](https://blog.matejc.com/blogs/myblog/graphical-ui-for-nix))
* [Should Nix have a GUI?](https://www.reddit.com/r/NixOS/comments/cu4dle/should_nix_have_a_gui/)
* [NIX FLAKES, PART 1: AN INTRODUCTION AND TUTORIAL](https://www.tweag.io/blog/2020-05-25-flakes/): "A flake is simply a source tree (such as a Git repository) containing a file named `flake.nix` that provides a standardized interface to Nix artifacts such as packages or NixOS modules."
* [nix flakes: Using nix flakes with NixOS](https://nixos.wiki/wiki/Flakes#Using_nix_flakes_with_NixOS)
* [nix flakes (edolstra's summary)](https://gist.github.com/edolstra/40da6e3a4d4ee8fd019395365e0772e7#overview)
* [flake-utils-plus](https://github.com/gytis-ivaskevicius/flake-utils-plus/)
"exposes a library abstraction to painlessly generate nixos flake configurations." ([sample](https://github.com/gytis-ivaskevicius/nixfiles/blob/master/flake.nix))

... but this project is not a graphical installer, rather a 'graphical patch manager'

## license

license is [CC Zero 1.0](LICENSE) = zero limits + zero warranty
