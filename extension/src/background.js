/*
console.log("background.js: start working");

function handleMessage(request, sender, respond) {
  console.log(`background.js: got request`, request);
  if (request.command == 'get') {
  	return respond({ value: localStorage.getItem(request.key) });
  }
}

console.log("background.js: listen for messages");
browser.runtime.onMessage.addListener(handleMessage);
*/

// NOT:
// https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/sendMessage
// .. this is for web-extensions, not browser-extensions (chrome-extensions)

// https://developer.chrome.com/docs/extensions/reference/
// https://developer.chrome.com/docs/extensions/reference/runtime/
