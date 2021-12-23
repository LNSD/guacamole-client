/* eslint-disable capitalized-comments */

import { ChainedTunnel, WebSocketTunnel, HTTPTunnel } from "@guacamole-client/tunnel";

// @ts-ignore
declare global {
  interface Window {
    Guacamole: {
      ChainedTunnel: any;
      WebSocketTunnel: any;
      HTTPTunnel: any;
      Client: any;
      Keyboard: any;
      Mouse: any;
    };
  }
}

// @ts-ignore
const { Client, /* ChainedTunnel, WebSocketTunnel, HTTPTunnel, */ Mouse, Keyboard } = window.Guacamole;

(async () => {
  const response = await fetch("http://localhost:8080/guacamole/api/tokens", {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/x-www-form-urlencoded"
    },
    body: "username=guacadmin&password=guacadmin",
    mode: "no-cors"
  });

  const json = await response.json() as Partial<{ authToken: string }>;
  const token = String(json.authToken);

  // Get display div from document
  const display = document.getElementById("display");
  if (display === null) {
    throw new Error("Cannot find [id='display'] element");
  }

  const tunnel = new ChainedTunnel(
    new WebSocketTunnel("ws://localhost:8080/guacamole/websocket-tunnel"),
    new HTTPTunnel("http://localhost:8080/guacamole/tunnel")
  );

  // Instantiate client, using the HTTP tunnel for communications.
  const guac = new Client(tunnel);

  // Add client to display div
  display.appendChild(guac.getDisplay().getElement());

  // Error handler
  guac.onerror = function(error) {
    console.error(error);
  };

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
