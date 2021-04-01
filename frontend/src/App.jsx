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

const highlight = (src, path) => hljs.highlight(src, { language: path.split(".").slice(-1)[0] }).value;



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



function JobView(props) {
  return (
    <div class={(() => (props.prefix ? 'job-view' : 'job-view root'))()}>
      <Show when={props.job} fallback={
        <div>( no job )</div>
      }>
        <Show when={props.job.readyTime} fallback={
          <div>( job {props.job.jobId} is loading ... )</div>
        }>
          <div>
            <div>job {props.job.jobId}</div>
            <div>
              download and diff took {' '}
              {roundFloat((props.job.readyTime - props.job.startTime), 2)}
              {' '} seconds
            </div>
            <div>{props.job.filesCount} files</div>
          </div>
          <For each={props.job.files} fallback={
            <div>( no job files )</div>
          }>
            {(file, fileId) => {
              // TODO use solidjs styled components
              globalStyle(`pre.file { white-space: pre-wrap; text-align: left; font-family: monospace; }`);

              const fileExt = file.filename.split(".").slice(-1)[0];
              //const fileExt = path => path.split(".").slice(-1)[0]; // TODO need this?

              const fileLower = () => highlight(file.lowerText, fileExt);
              const fileUpper = () => highlight(file.upperText, fileExt);
              const fileText = () => highlight(file.fileText, fileExt);
              const fileDiff = () => highlight(file.patchText, 'diff');

              return (
                <details>
                  <summary>{file.filename}</summary>

                  <div>filename = {file.filename}</div>
                  <div>raw_url = <a href={file.raw_url}>{file.raw_url}</a></div>
                  <div>sha = {file.sha}</div>
                  <div>localPath = {file.localPath}</div>

                  <details>
                    <summary>github vs patched</summary>
                    <pre class="file github-diff" innerHTML={fileDiff()} />
                  </details>
                  <details>
                    <summary>patched</summary>
                    <pre class="file lower" innerHTML={fileText()} />
                  </details>

                  <details>
                    <summary>lower vs patched</summary>
                    <pre class="file lower-diff" innerHTML={file.lowerDiff} />
                  </details>
                  <details>
                    <summary>lower</summary>
                    <pre class="file lower" innerHTML={fileLower()} />
                  </details>

                  <Show when={file.upperDiff}>
                    <details>
                      <summary>upper vs patched</summary>
                      <pre class="file upper-diff" innerHTML={file.upperDiff} />
                    </details>
                    <details>
                      <summary>upper</summary>
                      <pre class="file upper" innerHTML={fileUpper()} />
                    </details>
                  </Show>
                </details>
              );
            }}
          </For>
        </Show>
      </Show>
    </div>
  );
}



const roundFloat = (number, precision) => parseFloat(number.toFixed(precision));

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

  const [state, setState] = createState({
    fileList: [],
    fileSelected: '',
    patchedFiles: [],
    job: null,
    diffData: null,
  });



  onMount(async () => {
    const queryStr = window.location.hash.slice(1);
    const query = parseQuery(queryStr);
    if (query.install) {
      //console.log(`install. url = ${query.install}`);
      const dataObject = { url: query.install };
      const response = await fetch(`/backend/install`, postOptions(dataObject));
      if (!response.ok) { console.log(`http request error ${response.status}`); return; }
      const responseData = await response.json();
      setState('job', { jobId: responseData.jobId, url: responseData.url }); // show 'job x is loading ...'
      //console.log("install response:"); console.dir(responseData);
      // start polling the backend for the job status ...
      setTimeout(() => pollInstallJobStatus(responseData.jobId), 100);
    }
    loadFiles(); // ... for TreeView
  })



  async function pollInstallJobStatus(jobId, step = 0) {
    //console.log(`poll install job STATUS. job ${jobId} + step ${step}`);
    var dataObject = { jobId };
    var response = await fetch(`/backend/jobstatus`, postOptions(dataObject));
    if (!response.ok) { console.log(`http request error ${response.status}`); return; }
    var jobStatus = await response.json();
    //console.log("jobstatus response:"); console.dir(jobStatus);
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
    // visualize the patch auditing
    //console.log(`poll install job DATA. job ${jobId}`);
    var dataObject = { jobId };
    var response = await fetch(`/backend/jobdata`, postOptions(dataObject));
    if (!response.ok) { console.log(`http request error ${response.status}`); return; }
    const jobData = await response.json();
    //console.log("jobdata response:"); console.dir(jobData);
    if (jobData.job.files.length == 0) { console.log('error: no files in job data'); return; }

    setState('job', jobData.job);
  }



  async function loadFiles(node = null, prefix = '', get = null) {
    const path = (node && get) ? get.path(node, prefix) : '';
    //console.log(`loadFiles. path = ${path}`);
    const dataObject = { path };
    const response = await fetch(`/backend/list`, postOptions(dataObject));
    if (!response.ok) { console.log(`http request error ${response.status}`); return; }
    const responseData = await response.json();
    //console.dir(responseData.files);
    if (!state.fileList || state.fileList.length == 0)
      setState('fileList', responseData.files); // init
    else {
      //console.log(`add files for path ${path}`)
      const keyPath = ['fileList'];
      const childNodesIdx = 3;
      let parentDir = state.fileList;
      path.split('/').filter(Boolean).forEach((d, di) => {
        const i = parentDir.findIndex(([ depth, type, file, arg ]) => (type == 'd' && file == d));
        keyPath.push(i); parentDir = parentDir[i];
        keyPath.push(childNodesIdx); parentDir = parentDir[childNodesIdx];
      })
      setState(...keyPath, responseData.files);
    }
  }



  function handleUpload(event) {
    event.preventDefault();
    //console.log('submit');
    var fileReader = new FileReader();
    fileReader.onload = async event => {
      const bText = event.target.result;
      const bExt = fileInput.files[0].name.split(".").slice(-1)[0];
      bContainer.innerHTML = highlight(bText, bExt);
      const dataObject = {
        a: state.fileSelected,
        b: fileInput.files[0].name,
        bTime: fileInput.files[0].lastModified,
        bSize: fileInput.files[0].size,
        bText,
      };
      const response = await fetch(`/backend/diff`, postOptions(dataObject));
      if (!response.ok) { console.log(`http request error ${response.status}`); return; }
      const diffData = await response.json();
      //console.dir({ diffData });

      setState('diffData', diffData);
      //diffContainer.innerHTML = diffData.diffHtml;
      //aContainer.innerHTML = highlight(diffData.aText, 'nix');
      // TODO render state.diffData
    };
    fileReader.readAsText(fileInput.files[0], "UTF-8");
  }



  function fileListGetters() {
    const get = {};
    get.isLeaf = node => (node[1] != 'd');
    get.name = node => node[2];
    get.path = (node, prefix) => prefix ? `${prefix}/${get.name(node)}` : get.name(node);
    get.childNodes = node => node[3];
    const fancyPath = (node, prefix) => (
      prefix ? <>
        <span class="prefix">{(() => prefix)()}/</span>
        <span class="name">{get.name(node)}</span>
      </> : get.name(node)
    );
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
      return <span class="file" onClick={() => setState('fileSelected', get.path(node, prefix))}>{fancyPath(node, prefix)}</span>;
    };
    return get;
  }

  function fileListFilter() {
    return node => (node[2][0] != '.'); // hide dotfiles
  }

  return (
    <div class={styles.App}>
      <div>file to patch: {state.fileSelected || '( none. please select file )'}</div>
      <form onSubmit={handleUpload}>
        <input type="file" name="bFile" ref={fileInput} />
        <input type="submit" value="Upload and Compare" />
      </form>
      <h4>install job</h4>
      <JobView job={state.job} />
      <h4>file tree</h4>
      <TreeView data={state.fileList} get={fileListGetters()} filter={fileListFilter()} load={loadFiles} />
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
