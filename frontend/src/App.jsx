// TODO workflow
// * select the file to patch (file explorer for nixpkgs lower dir)
// * upload patched file
// * compare patched file with files from lower dir (and upper dir, if exists)
// * allow to apply patch = save file to upper dir ("are you sure??")

// TODO
// * allow to enter file path manually (relative to nixpkgs)
// * list lower or upper files
// * future: show git history of upper files
// * prettier file browser

// * implement a semi-automatic review process, according to
//    * https://nixos.org/manual/nixpkgs/stable/#chap-reviewing-contributions
//      The Nixpkgs project receives a fairly high number of contributions via GitHub pull requests.
//      Reviewing and approving these is an important task and a way to contribute to the project.

/* https://nixos.org/manual/nixos/stable/options.html#opt-nix.useSandbox
nix.useSandbox
If set, Nix will perform builds in a sandboxed environment that it will set up automatically for each build. This prevents impurities in builds by disallowing access to dependencies outside of the Nix store by using network and mount namespaces in a chroot environment. This is enabled by default even though it has a possible performance impact due to the initial setup time of a sandbox for each build. It doesn't affect derivation hashes, so changing this option will not trigger a rebuild of packages.

Type: boolean or one of "relaxed"

Default: true

Declared by:

<nixpkgs/nixos/modules/services/misc/nix-daemon.nix>
*/

/* PR template
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
*/

import { createSignal, createState, onMount } from "solid-js";

import { glob as globalStyle } from "solid-styled-components";

//import logo from "./logo.svg";

import styles from "./App.module.css";
import 'highlight.js/styles/github.css';

//import hljs from 'highlight.js'; // all languages (dynamic include on demand?)
import hljs from 'highlight.js/lib/core';

import hljsLangNix from 'highlight.js/lib/languages/nix';
import hljsLangBash from 'highlight.js/lib/languages/bash';
import hljsLangMakefile from 'highlight.js/lib/languages/makefile';
import hljsLangDiff from 'highlight.js/lib/languages/diff';

hljs.registerLanguage('nix', hljsLangNix);
hljs.registerLanguage('bash', hljsLangBash);
hljs.registerLanguage('makefile', hljsLangMakefile);
hljs.registerLanguage('diff', hljsLangDiff);

/*
  // FIXME hide/show parent dirs
  // note. prop.root is not passed to recursion
  const getList = (list, root) => {
    if (root) {
      for (const idx in root) {
        list = list[idx];
      }
    }
    return list;
  };
//      <For each={getList(props.list, props.root)} fallback={<li>list is empty</li>}>
//      <For each={props.list} fallback={<li>list is empty</li>}>
*/


globalStyle(`
  ul.tree-view.root { margin-left: 1px; margin-right: 1px; }
  ul.tree-view { text-align: left; }
  ul.tree-view, ul.tree-view ul { list-style: none; padding: 0; }
  ul.tree-view li.branch > span { color: blue; font-family: monospace; }
  ul.tree-view li.branch > ul { display: none; /* default collapsed */ }
  ul.tree-view li.branch.expanded { outline: solid 1px grey; }
  ul.tree-view li.branch.expanded > ul { display: block; }
  ul.tree-view li.empty { font-style: italic; }
  ul.tree-view span.link-source { color: green; font-family: monospace; }
  ul.tree-view span.file { font-family: monospace; }
  ul.tree-view span.prefix { opacity: 0.6; }

  body { padding: 0.5em; }
`);

function TreeView(props) {
  return (
    <ul class={(() => (props.prefix ? 'tree-view' : 'tree-view root'))()}>
      <For each={props.filter ? props.data.filter(props.filter) : props.data} fallback={
        <li class="empty">{props.get.emptyLabel(props.prefix)}</li>
      }>
        {(node, idx) => (
          <Show when={props.get.isLeaf(node)} fallback={
            <li class="branch">
              <span onClick={event => {
                props.load(node, props.prefix, props.get);
                // go up to nearest <li class="branch">
                let li = event.target;
                while (li && li.localName != 'li') li = li.parentNode;
                if (!li) throw { error: 'li not found', event };
                li.classList.toggle('expanded');
              }}>
                {props.get.branchLabel(node, props.prefix)}
              </span>
              <TreeView
                data={props.get.childNodes(node)}
                get={props.get}
                prefix={props.get.path(node, props.prefix)}
                load={props.load}
              />
            </li>
          }>
            <li class="leaf">{props.get.leafLabel(node, props.prefix)}</li>
          </Show>
        )}
      </For>
    </ul>
  );
}


function postOptions(data) {
  return {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' }
  };
}

function parseQuery(queryStr) {
  return Object.fromEntries(
    queryStr.split('&').map(keyval => {
      const cut = keyval.indexOf('=');
      const key = keyval.slice(0, cut);
      const val = keyval.slice(cut+1);
      return [key, val];
    })
  );
}

function App() {

  let fileInput;
  let jobstatusContainer;

  const [state, setState] = createState({
    fileList: [],
    fileSelected: '',
  });
  const selectFile = path => setState('fileSelected', path);

  onMount(async () => {
    const queryStr = window.location.hash.slice(1);
    const query = parseQuery(queryStr);
    if (query.install) {
      console.log(`install. url = ${query.install}`);
      const dataObject = { url: query.install };
      const response = await fetch(`/backend/install`, postOptions(dataObject));
      if (!response.ok) { console.log(`http request error ${response.status}`); return; }
      const responseData = await response.json();
      console.log("install response:"); console.dir(responseData);
      // start polling the backend for the job status ...
      setTimeout(() => pollInstallJobStatus(responseData.jobId), 100);
    }
  })



  async function pollInstallJobStatus(jobId, step = 0) {
    console.log(`poll install job STATUS. job ${jobId} + step ${step}`);
    var dataObject = { jobId };
    var response = await fetch(`/backend/jobstatus`, postOptions(dataObject));
    if (!response.ok) { console.log(`http request error ${response.status}`); return; }
    var jobStatus = await response.json();
    console.log("jobstatus response:"); console.dir(jobStatus);

    // TODO visualize job status ...
    jobstatusContainer.innerHTML = JSON.stringify(jobStatus, null, 2);

    // repeat poll ...
    // latency for a small patch: 2 second
    if (jobStatus.readyTime == undefined) {
      // not ready
      if (step < 30) // wait 15 seconds
        return setTimeout(() => pollInstallJobStatus(jobId, step + 1), 500); // repeat
      else
        return console.log(`stop polling job ${jobId}`); // give up. TODO better
    }

    // done polling. job data is ready :)
    //if (jobStatus.readyTime != undefined) {
    console.log('job is downloaded and diffed -> time to audit :)')
    // visualize the patch auditing

    console.log(`poll install job DATA. job ${jobId}`);
    var dataObject = { jobId };
    var response = await fetch(`/backend/jobdata`, postOptions(dataObject));
    if (!response.ok) { console.log(`http request error ${response.status}`); return; }
    const jobData = await response.json();
    console.log("jobdata response:"); console.dir(jobData);
    const job = jobData.job;

    if (job.files.length == 0) {
      console.log('error: no files in job data');
      return;
    }

    const file = job.files[0]; // TODO show all files (use a tabs widget)


    const fileExt = file.filename.split(".").slice(-1)[0];
console.log('get hl');
    const hl = str => hljs.highlight(str, { language: fileExt }).value;

console.log('hl ... ext = ' + fileExt);
console.log('filename = ' + file.filename);

    // TODO syntax highlight
    upperContainer.innerHTML = hl(file.upperText);
console.log('hl 2');
    upperDiffContainer.innerHTML = file.upperDiff;
console.log('hl 3');
    lowerContainer.innerHTML = hl(file.lowerText);
console.log('hl 4');
    lowerDiffContainer.innerHTML = file.lowerDiff;
console.log('hl 5');
    bContainer.innerHTML = hl(file.fileText);
  }

  //file.upperDiff = htmlOfAnsi(diffText);

  async function loadFiles(node = null, prefix = '', get = null) {
    //const path = prefix + (node ? get.name(node) : '');

    //get.path = (node, prefix) => prefix ? `${prefix}/${get.name(node)}` : get.name(node);
    const path = (node && get) ? get.path(node, prefix) : '';


    console.log(`loadFiles. path = ${path}`);
    const dataObject = { path };
    const response = await fetch(`/backend/list`, postOptions(dataObject));
    //response.status; // => 404
    if (!response.ok) {
      console.log(`http request error ${response.status}`);
      return;
    }
    const responseData = await response.json();
    //setState('fileList', old => responseData.files);
    console.dir(responseData.files);
    if (state.fileList.length == 0) {
      // init
      console.log(`init file list`)
      setState('fileList', responseData.files);
    }
    else {
      // add
      // FIXME files added, but not visible -> manually trigger reaction?
      console.log(`add files for ${path}`)

      const keyPath = ['fileList'];
      const childNodesIdx = 3;
      let parentDir = state.fileList;
      path.split('/').filter(Boolean).forEach((d, di) => {
        const i = parentDir.findIndex(([ depth, type, file, arg ]) => (type == 'd' && file == d));
        keyPath.push(i);
        parentDir = parentDir[i];
        keyPath.push(childNodesIdx);
        parentDir = parentDir[childNodesIdx];
      })
      setState(...keyPath, responseData.files);
    }
  }

  function handleUpload(event) {
    event.preventDefault();
    console.log('submit');

    var fileReader = new FileReader();
    fileReader.onload = async event => {
      const bText = event.target.result;
      const bExt = fileInput.files[0].name.split(".").slice(-1)[0];
      bContainer.innerHTML = hljs.highlight(bText, {language: bExt}).value;

      const dataObject = {
        a: state.fileSelected, // 'nixos/modules/services/networking/firewall.nix', // TODO
        b: fileInput.files[0].name,
        bTime: fileInput.files[0].lastModified,
        bSize: fileInput.files[0].size,
        bText,
      };

      const options = {
        method: 'POST',
        body: JSON.stringify(dataObject),
        headers: {
          'Content-Type': 'application/json',
        }
      };

      const response = await fetch(`/backend/diff`, options);

      //response.status; // => 404
      if (!response.ok) {
        console.log(`http request error ${response.status}`);
        return;
      }

      const responseData = await response.json();
      console.dir({ responseData });

      diffContainer.innerHTML = responseData.diffHtml;
      aContainer.innerHTML = hljs.highlight(responseData.aText, {language: 'nix'}).value;

    };
    fileReader.readAsText(fileInput.files[0], "UTF-8");
  }

  let diffContainer;
  let aContainer;
  let bContainer;

  let upperContainer;
  let upperDiffContainer;

  let lowerContainer;
  let lowerDiffContainer;



//      <button onClick={e => loadFiles()}>Load files</button>

onMount(() => {
  loadFiles();
});

  return (
    <div class={styles.App}>
      <div>file to patch: {state.fileSelected || '( none. please select file )'}</div>
      <form onSubmit={handleUpload}>
        <input type="file" name="bFile" ref={fileInput} />
        <input type="submit" value="Upload and Compare" />
      </form>
      <h4>job status</h4>
      <pre style="text-align: left" ref={jobstatusContainer}></pre>
      <h4>files</h4>
      <div><TreeView
        data={state.fileList}
        filter={node => (node[2][0] != '.')}
        load={loadFiles}
        get={(() => {
          const get = {};
          get.isLeaf = node => (node[1] != 'd');
          get.name = node => node[2];
          get.path = (node, prefix) => prefix ? `${prefix}/${get.name(node)}` : get.name(node);
          get.childNodes = node => node[3];
          //get.branchLabel = get.path;
          const fancyPath = (node, prefix) => (
            prefix ? <>
              <span class="prefix">{(() => prefix)()}/</span>
              <span class="name">{get.name(node)}</span>
            </> : get.name(node)
          );
          const fancyPathZZZZZ = get.path;
          get.branchLabel = fancyPath;
          get.emptyLabel = (prefix) => '( empty )';
          const isLink = node => (node[1] == 'l');
          const linkTarget = node => node[3];
          get.leafLabel = (node, prefix) => {
            if (isLink(node))
              return <>
                <span class="link-source">{fancyPath(node, prefix)}</span>{" -> "}
                <span class="link-target">{linkTarget(node)}</span>
              </>;
            return <span class="file" onClick={() => selectFile(get.path(node, prefix))}>{fancyPath(node, prefix)}</span>;
          };
          //depth: node => node[0], // not used. TODO remove?
          //isDir: node => node[1] == 'd',
          //isLink: node => node[1] == 'f',
          //linkTarget: node => node[3],
          return get;
        })()}
      /></div>
      <h4>diff</h4>
      <div ref={diffContainer} style="white-space: pre-wrap; text-align: left; font-family: monospace" />
      <h4>a</h4>
      <div ref={aContainer} style="white-space: pre-wrap; text-align: left; font-family: monospace" />
      <h4>b</h4>
      <div ref={bContainer} style="white-space: pre-wrap; text-align: left; font-family: monospace" />
      <h4>upper</h4>
      <div ref={upperContainer} style="white-space: pre-wrap; text-align: left; font-family: monospace" />
      <h4>upperDiff</h4>
      <div ref={upperDiffContainer} style="white-space: pre-wrap; text-align: left; font-family: monospace" />
      <h4>lower</h4>
      <div ref={lowerContainer} style="white-space: pre-wrap; text-align: left; font-family: monospace" />
      <h4>lowerDiff</h4>
      <div ref={lowerDiffContainer} style="white-space: pre-wrap; text-align: left; font-family: monospace" />
    </div>
  );
}

const Loader = () => {
  const [state, setState] = createState({ count: 0 }),
    interval = setInterval(() => setState("count", (c) => c + 1), 1000);
  onCleanup(() => clearInterval(interval));

  return <div>Loading... {state.count}</div>;
};


function createDelay() {
  return new Promise((resolve) =>
    setTimeout(() => resolve(Date.now()), Math.random() * 8000)
  );
}

const AsyncChild = ({ start }) => {
  const [time] = createResource("time", createDelay);
  return <div>Async loaded after {time() - start}ms</div>;
};



function Result() {
  return (
    <Suspense fallback={<Loader />}>
      <AsyncChild start={startTime} />
      <AsyncChild start={startTime} />
      <AsyncChild start={startTime} />
      <AsyncChild start={startTime} />
    </Suspense>
  );
}

export default App;
