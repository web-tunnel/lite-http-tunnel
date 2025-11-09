# Lite HTTP Tunnel (Server)

Expose any local HTTP or WebSocket service to the internet through a lightweight tunnel. The server multiplexes inbound traffic and streams it to connected clients over a persistent WebSocket. Inspired by [Ngrok](https://github.com/inconshreveable/ngrok) and [node-http-proxy](https://github.com/http-party/node-http-proxy).

![http tunnel](https://user-images.githubusercontent.com/7036536/155876708-f30f4921-c8c8-463d-8917-c4f932d3b2e6.png)

## How it works

1. The client opens a Socket.IO WebSocket to the server and stays connected.
2. For each incoming public request, the server forwards headers and body to the client via stream events.
3. The client makes a request to the local target and streams the response back. WebSocket upgrades are handled bidirectionally.

Key features:
- HTTP and WebSocket support
- Multi-client routing by host and path prefix (longest-prefix wins)
- Forwarded headers preserved (x-forwarded-*)
- JWT-protected tunnel connection

## Deploy the server

This is a standard Node.js/Express server.

- Deploy this project on [your own server](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Server-side/Express_Nodejs/deployment)
	```sh
    git clone https://github.com/web-tunnel/lite-http-tunnel.git
	cd lite-http-tunnel
	npm install
	npm start
	```

- One‑click deploy
	- Heroku: [![Deploy To Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)
	- Render: [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### Required environment variables

- `SECRET_KEY`: Secret used to sign/verify JWTs
- `VERIFY_TOKEN`: Static token value expected inside the JWT payload
- `JWT_GENERATOR_USERNAME`, `JWT_GENERATOR_PASSWORD` (optional, bootstrap only):
	Used by `/tunnel_jwt_generator` to issue a JWT during initial setup. Remove them after obtaining the client token.

## Use the client

Install the client on the machine that can reach your local service:

```sh
npm i -g lite-http-tunnel
lite-http-tunnel -h
```

Point the client to your server and authenticate:

```sh
# Set server URL (optionally with a profile)
lite-http-tunnel config server https://your-public-server

# Get a JWT from the server using generator credentials (bootstrap)
lite-http-tunnel auth $JWT_GENERATOR_USERNAME $JWT_GENERATOR_PASSWORD
```

Start the tunnel:

```sh
# Basic
lite-http-tunnel start <local_port>

# Override Host header (origin) for the local target
lite-http-tunnel start <local_port> -o localhost:5000

# Override local hostname used for target resolution (default: localhost)
lite-http-tunnel start <local_port> -h my-localhost
```

Once running, requests to your public server will be forwarded to your local service.

### Profiles (multiple saved configs)

The CLI supports named profiles so you can save different servers/tokens locally. By default it uses the `default` profile and stores configs in `~/.lite-http-tunnel/<profile>.json`.

Common examples:

```sh
# Save server under a named profile
lite-http-tunnel config server https://your-public-server -p profile1

# Authenticate and save JWT to that profile
lite-http-tunnel auth $JWT_GENERATOR_USERNAME $JWT_GENERATOR_PASSWORD -p profile1

# Start the client using that profile
lite-http-tunnel start <local_port> -p profile1
```

Use different profiles to switch between environments (e.g., staging vs prod) or to run multiple clients with distinct settings.

## Multiple clients

### By domain
Each tunnel is keyed by request `Host`. If you run the server under multiple domains, connect one client per domain.

### By path prefix
From `0.2.0`, multiple clients can share the same host using different path prefixes.

Client 1:
```
lite-http-tunnel config path /api_v1
lite-http-tunnel start <local_port>
```

Client 2:
```
lite-http-tunnel config path /api_v2
lite-http-tunnel start <local_port>
```

Requests matching `/api_v1` route to client 1; `/api_v2` route to client 2. Longest prefix always wins.

## Related

Intro article: [Building a HTTP Tunnel with WebSocket and Node.JS](https://medium.com/@embbnux/building-a-http-tunnel-with-websocket-and-node-js-98068b0225d3?source=friends_link&sk=985d90ec9f512928b34ed38b7ddcb378)
