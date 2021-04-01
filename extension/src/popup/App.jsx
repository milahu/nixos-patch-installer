import styles from "./App.module.css";
import { glob as globalStyle } from "solid-styled-components";
import logo from '../images/nixos.svg';
import { createSignal, onMount } from "solid-js";

const backendUrlDefault = 'http://localhost:3000';

function App() {

  let [backendUrl, setBackendUrl] = createSignal('');
  let backendUrlInput;

  onMount(() => {
    chrome.storage.sync.get(['backendUrl'], result => {
      if (!result.backendUrl) {
        // init
        chrome.storage.sync.set({ backendUrl: backendUrlDefault });
        result.backendUrl = backendUrlDefault;
      }
      setBackendUrl(result.backendUrl);
      backendUrlInput.value = result.backendUrl;
    });
  });

  function handleSubmit(event) {
    event.preventDefault();
    //console.dir({ backendUrl: backendUrlInput.value })
    chrome.storage.sync.set({ backendUrl: backendUrlInput.value });
    //}, res => console.log('Settings saved'));
    window.close();
  }

  return (
    <main>
      <div id="head">
        <img width="32" src={logo} alt="nixos logo" />
        <div>NixOS Patch Installer</div>
      </div>
      <div>
        <a href={backendUrl()} target="_blank">Show backend</a>
      </div>
      <label>
        <div>Backend URL</div>
        <input ref={backendUrlInput} onInput={e => setBackendUrl(e.target.value)} type="text" size="40" name="backend-url" />
      </label>
      <input onClick={handleSubmit} type="submit" value="Save config" />
    </main>
  );
}

globalStyle(`
  input {
    border: solid 1px grey;
    padding: 5px;
  }
  input[type=text] {
    font-family: monospace;
    width: 100%;
    box-sizing: border-box;
    text-align: center;
  }
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  main > * {
    margin: 0.5em 0;
  }
  main > label > div {
    margin-bottom: 0.25em;
  }
  div#head {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  div#head > img {
    margin-right: 8px;
  }
  body {
    padding: 5px 10px;
    width: 16em;
    font-size: 1em;
  }
  a { text-decoratino: none; }
  a:hover { text-decoratino: underline; }
`);

export default App;
