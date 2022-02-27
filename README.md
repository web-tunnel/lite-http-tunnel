# Lite HTTP Tunnel

A HTTP Tunnel tool to help you expose local HTTP server behind a NAT or firewall to the internet. Inspired by [Ngrok](https://github.com/inconshreveable/ngrok).

![http tunnel](https://user-images.githubusercontent.com/7036536/155876708-f30f4921-c8c8-463d-8917-c4f932d3b2e6.png)


## How it work

The tunnel is based on `WebSocket`. We have a `WebSocket` connection between the client and server to stream HTTP request from public server to your local server.

## Usage

### Deploy at public server

Firstly please deploy this project to your own web host with public internet access. The project is just a `Node.js` web server based on `Express.js`. So just just deploy as what you do for [deploying Node.js web server](https://developer.mozilla.org/en-US/docs/Learn/Server-side/Express_Nodejs/deployment).

It is recommended to deploy into Heroku with `Deploy To Heroku` button below:

[![Deploy To Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

With Heroku, you can get a free HTTPS web server with a fixed public domain.

#### Get JWT Token

In first deployment, you need to provide `JWT_GENERATOR_USERNAME` and `JWT_GENERATOR_PASSWORD` environment variables, then you can access `https://your_web_host_domain/tunnel_jwt_generator?username=your_generator_username&password=your_generator_password` to get `JWT Token`. After you get `JWT Token`, you can remove `JWT_GENERATOR_USERNAME` and `JWT_GENERATOR_PASSWORD` environment variables to remove `/tunnel_jwt_generator` access.

You can also generate JWT Token in your local by following code [here](https://github.com/embbnux/lite-http-tunnel/blob/main/server.js#L71).

### Setup Client

Please install `lite-http-tunnel` client in your local computer where it can access your local HTTP server.

```
$ npm i -g lite-http-tunnel
$ lite-http-tunnel -h
```

Config remote public server address:

```
$ lite-http-tunnel config server https://your_web_host_domain
```

Config jwt token that you got from server:

```
$ lite-http-tunnel config jwt your_jwt_token
```

Start client

```
$ lite-http-tunnel start your_local_server_port
```
Please replace your_local_server_port with your local HTTP server port, eg: `3000`.

After that you can access your local HTTP server by access `your_public_server_domain`.
