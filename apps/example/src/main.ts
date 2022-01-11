/* eslint-disable capitalized-comments */

import {
  buildWsTunnelUrl,
  ChainedTunnel,
  HttpClient,
  HTTPTunnel,
  WebSocketTunnel
} from '@guacamole-client/tunnel';
import { Client } from '@guacamole-client/client';
import { Keyboard, Mouse } from '@guacamole-client/input';
import { ConnectableWebSocket, xhr } from '@guacamole-client/net';

// // @ts-ignore
// declare global {
//   interface Window {
//     Guacamole: {
//       ChainedTunnel: any;
//       WebSocketTunnel: any;
//       HTTPTunnel: any;
//       Client: any;
//       Keyboard: any;
//       Mouse: any;
//     };
//   }
// }

// // @ts-ignore
// const { /* Client, ChainedTunnel, WebSocketTunnel,*/ HTTPTunnel /*, Mouse, Keyboard */ } = window.Guacamole;

(async () => {
  const response = await fetch('http://localhost:8080/guacamole/api/tokens', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: 'username=guacadmin&password=guacadmin',
    mode: 'no-cors'
  });

  const json = await response.json() as Partial<{ authToken: string }>;
  const token = String(json.authToken);

  // Get display div from document
  const display = document.getElementById('display');
  if (display === null) {
    throw new Error('Cannot find [id=\'display\'] element');
  }

  // Tunnel
  const queryParams = new URLSearchParams(window.location.search);
  const tunnelSelector = queryParams.get('tunnel') ?? 'ws';

  const ws = new ConnectableWebSocket();
  const url = buildWsTunnelUrl('ws://localhost:8080/guacamole/websocket-tunnel');
  const wsTunnel = new WebSocketTunnel(ws, url);

  const httpFactory = xhr.create({ baseURL: 'http://localhost:8080/guacamole/tunnel' });
  const httpClient = new HttpClient(httpFactory);
  const httpTunnel = new HTTPTunnel(httpClient);

  const tunnel = new ChainedTunnel(
    (tunnelSelector === 'ws' ? wsTunnel : httpTunnel),
    (tunnelSelector !== 'ws' ? wsTunnel : httpTunnel)
  );

  // Instantiate client, using the HTTP tunnel for communications.
  const guac = new Client(tunnel);

  // Add client to display div
  display.appendChild(guac.getDisplay().getElement());

  // Error handler
  guac.addEventListener('onerror', console.error);

  // Connect
  guac.connect(`token=${token}&GUAC_DATA_SOURCE=default&GUAC_ID=DEFAULT&GUAC_TYPE=c&GUAC_WIDTH=2880&GUAC_HEIGHT=598&GUAC_DPI=192&GUAC_TIMEZONE=Europe/Madrid&GUAC_AUDIO=audio/L8&GUAC_AUDIO=audio/L16&GUAC_IMAGE=image/jpeg&GUAC_IMAGE=image/png&GUAC_IMAGE=image/webp`);

  // Disconnect on close
  window.onunload = function() {
    guac.disconnect();
  };

  // Mouse
  const mouse = new Mouse(guac.getDisplay().getElement());

  const mouseCallback = function(mouseState) {
    guac.sendMouseState(mouseState);
  };

  mouse.onmousedown = mouseCallback;
  mouse.onmouseup = mouseCallback;
  mouse.onmousemove = mouseCallback;

  // Keyboard
  const keyboard = new Keyboard(document);

  keyboard.onkeydown = function(keysym) {
    guac.sendKeyEvent(true, keysym);
  };

  keyboard.onkeyup = function(keysym) {
    guac.sendKeyEvent(false, keysym);
  };
})();
