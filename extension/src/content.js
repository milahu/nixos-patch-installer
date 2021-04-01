//console.log("content.js: start working");

const link_id = 'nixos-patch-installer-extension';

if (document.getElementById(link_id)) {
  console.warn(`already added button #${link_id}`)
  // TODO make sure the url is correct?
}
else {
  //console.log("content.js: get backendUrl from store");
  chrome.storage.sync.get(['backendUrl'], addButton);
}

function addButton({ backendUrl }) {

  //console.log(`content.js: got backendUrl ${backendUrl}`);

  // https://www.vectorlogo.zone/logos/nixos/nixos-icon.svg
  const icon_size = 16;
  const icon_class = 'octicon d-none d-md-inline-block';
  const nixos_icon_svg = `
    <svg
      class="${icon_class}"
      xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
      width="${icon_size}" height="${icon_size}" viewBox="0 0 60 60"
    >
      <defs>
        <path id="B" d="M18.305 30.642L32.92 55.956l-6.716.063-3.902-6.8-3.93 6.765-3.337-.002-1.71-2.953 5.598-9.626-3.974-6.916z"/>
      </defs>
      <g fill-rule="evenodd">
        <use xlink:href="#B" fill="#5277c3"/>
        <path d="M23.58 20.214L8.964 45.528 5.55 39.743l3.94-6.78-7.823-.02L0 30.052l1.703-2.956 11.135.035 4.002-6.9zM24.7 40.45h29.23l-3.302 5.85-7.84-.022 3.894 6.785-1.67 2.9-3.412.004-5.537-9.66-7.976-.016zm17.014-11.092L27.1 4.043l6.716-.063 3.902 6.8 3.93-6.765 3.337.002 1.7 2.953-5.598 9.626 3.974 6.916z" fill="#7ebae4"/>
        <g fill="#5277c3">
          <use xlink:href="#B"/>
          <path d="M35.28 19.486l-29.23-.002 3.303-5.848 7.84.022L13.3 6.873l1.67-2.9 3.412-.004 5.537 9.66 7.976.016zm1.14 20.294l14.616-25.313 3.413 5.785-3.94 6.78 7.823.02 1.668 2.9-1.703 2.956-11.135-.035-4.002 6.9z"/>
        </g>
      </g>
    </svg>
  `;

  const a = document.createElement('a');

  const link_text = 'Install Patch'
  a.title = 'Install this patch on your NixOS machine';
  a.innerHTML = `${nixos_icon_svg} ${link_text}`;

  a.id = link_id;
  a.className = 'tabnav-tab flex-shrink-0  js-pjax-history-navigate';
  a.href = `${backendUrl}#install=${window.location.href}`;
  a.target = '_blank';

  document.querySelector('nav.tabnav-tabs').appendChild(a);
}
