/* PreviewerHost client: spawns the C# headless renderer, renders XAML -> PNG + control bounds.
 * Mirrors the extension's own hostClient so T1 tests exercise the real render pipeline. */
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');

const HOST_BIN = path.join(__dirname, '..', '..', 'host', 'bin', 'Debug', 'net8.0', 'PreviewerHost');

function waitForPort(port, ms) {
    return new Promise((resolve) => {
        const t0 = Date.now(); const net = require('net');
        const tick = () => {
            const s = net.connect(port, '127.0.0.1');
            s.on('connect', () => { s.destroy(); resolve(); });
            s.on('error', () => { s.destroy(); if (Date.now() - t0 > ms) resolve(); else setTimeout(tick, 150); });
        };
        tick();
    });
}

/**
 * Starts one PreviewerHost on a free port and returns a client:
 *   client.render(xaml, width, height, projectPath?) -> frame { png, width, height, controls, error }
 *   client.close()
 */
async function startHost(port) {
    const child = spawn(HOST_BIN, ['--port', String(port)], { cwd: path.dirname(HOST_BIN), stdio: 'inherit' });
    await waitForPort(port, 15000);
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

    let id = 0;
    const pending = new Map();
    ws.on('message', (m) => {
        const f = JSON.parse(m.toString());
        const cb = pending.get(f.id);
        if (cb) { pending.delete(f.id); cb(f); }
    });

    const render = (xaml, width = 800, height = 450, projectPath) => new Promise((res) => {
        const myId = ++id;
        pending.set(myId, res);
        ws.send(JSON.stringify({ id: myId, type: 'render', xaml, width, height, projectPath }));
    });

    // Fetches the production toolbox snippet for a control tag (same path the extension uses).
    const snippet = (tag) => new Promise((res) => {
        const myId = ++id;
        pending.set(myId, res);
        ws.send(JSON.stringify({ id: myId, type: 'snippet', tag }));
    });

    return {
        render,
        snippet,
        close: () => { try { ws.close(); } catch { } try { child.kill(); } catch { } }
    };
}

/** Renders XAML and resolves a frame with the PNG decoded (convenience for T1 tests). */
async function renderPng(host, xaml, width, height, projectPath) {
    const frame = await host.render(xaml, width, height, projectPath);
    if (frame.error) throw new Error('render error: ' + String(frame.error).slice(0, 300));
    const { decodePng } = require('./png');
    return { frame, img: decodePng(Buffer.from(frame.png, 'base64')) };
}

module.exports = { startHost, renderPng, HOST_BIN };
