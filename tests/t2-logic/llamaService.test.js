/* T2 — the user's own `llama-server` as a *service*: who started it, and the Start / Stop controls.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE (asked 2026-09-17: *"I don't know who started the llama server (could
 * have been me!). Could you add a control in the Settings panel to start and stop the llama server?"*).
 * Nothing here starts or stops a real service — a test that ran `systemctl --user stop llama-server.service`
 * on the developer's machine would be a test that turns off the thing it is measuring. So the file is split
 * the way the module is:
 *
 *   - the **parsers** are proved against output captured from this machine: `ss -ltnp`, the cgroup of the
 *     real llama-server process, the real unit file (whose `ExecStart` is written over nine lines with
 *     trailing backslashes) and the real `systemctl show`. "Who started it?" is answered by the kernel, and
 *     these are the exact bytes the kernel and systemd gave us;
 *   - the **decisions** that would be dangerous to get wrong are asserted against the source: every stop is
 *     confirmed, a *system* unit is never acted on (its `sudo` line is printed instead), and a port held by
 *     something that is not a llama-server is reported rather than signaled;
 *   - the **wiring** (panel ids, webview intents, both commands, both settings) is asserted against the
 *     files, because a stub cannot press a button.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
    describeOwner,
    endpointPort,
    llamaUnitsFromUnitFiles,
    parseListeners,
    parseSystemctlShow,
    startTarget,
    unitFromCgroup
} = require('../../out/llamaService.js');
const { llamaServerStatusLines } = require('../../out/llamaServer.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Real `ss -ltnp` output (this machine, 2026-09-17): the developer's service on 8080 and our sidecar. */
const SS = [
    'State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process',
    'LISTEN 0      512        127.0.0.1:8080       0.0.0.0:*    users:(("llama-server",pid=1918,fd=6))',
    'LISTEN 0      500        127.0.0.1:45725      0.0.0.0:*    users:(("ModelHost",pid=697356,fd=83))',
    'LISTEN 0      4096             [::]:631             [::]:*',
    'ESTAB  0      0          127.0.0.1:8080       127.0.0.1:52134  users:(("llama-server",pid=1918,fd=31))'
].join('\n');

/** Real cgroups, read from `/proc/<pid>/cgroup` on this machine. */
const CGROUP_USER_SERVICE = '0::/user.slice/user-1000.slice/user@1000.service/app.slice/llama-server.service';
const CGROUP_USER_MANAGER = '0::/user.slice/user-1000.slice/user@1000.service/init.scope';
const CGROUP_SHELL_SCOPE = '0::/user.slice/user-1000.slice/user@1000.service/app.slice/app-gnome-terminal-1234.scope';
const CGROUP_SYSTEM = '0::/system.slice/ollama.service';

/** The developer's own unit, verbatim (`~/.config/systemd/user/llama-server.service`). */
const UNIT_FILE = `[Unit]
Description=llama.cpp Qwen3-Coder Local Server
After=default.target

[Service]
Type=simple

ExecStart=/home/niel/llama.cpp/build/bin/llama-server \\
    -m /home/niel/.cache/huggingface/hub/models--n00b001--Qwen3-Coder-30B-A3B-Instruct-Q4_K_S-GGUF/snapshots/2d796cff/qwen3-coder-30b-a3b-instruct-q4_k_s.gguf \\
    --device none \\
    -c 16384 \\
    --port 8080 \\
    --alias qwen3-coder-local

Restart=on-failure
`;

/** Real `systemctl --user show -p UnitFileState -p MainPID -p ActiveEnterTimestamp … llama-server.service`. */
const SHOW = [
    'UnitFileState=enabled',
    'MainPID=1918',
    'ActiveEnterTimestamp=Tue 2026-09-15 20:04:49 SAST',
    'ExecMainStartTimestamp=Tue 2026-09-15 20:04:49 SAST'
].join('\n');

module.exports = async function (t) {
    // ---------- 1) which process holds the port ----------
    t.section('the socket: which process holds the port');
    {
        const listeners = parseListeners(SS);
        const llama = listeners.find((l) => l.port === 8080);
        t.ok(!!llama, 'listeners', 'the real output is parsed');
        t.equal(llama.pid, 1918, 'listeners', 'and the pid of the service is read from it');
        t.equal(llama.name, 'llama-server', 'listeners', 'with the process name, which is what Stop checks before signaling');
        t.ok(!listeners.some((l) => l.port === 52134), 'listeners',
            'an established connection is not a listener — only LISTEN lines count');
        const nobody = listeners.find((l) => l.port === 631);
        t.ok(!!nobody && nobody.pid === undefined, 'listeners',
            'a socket whose owner is not visible parses as "listening, owner unknown" rather than guessing a pid');
        t.equal(parseListeners('').length, 0, 'listeners', 'empty output is no listeners, not a crash');
        t.equal(parseListeners('LISTEN 0 128 0.0.0.0:8080 0.0.0.0:*').length, 1, 'listeners',
            'a line without the process column still yields the port');
    }

    // ---------- 2) who started it: the cgroup is the truth ----------
    t.section('the cgroup: unit, scope, and who is not a unit at all');
    {
        const user = unitFromCgroup(CGROUP_USER_SERVICE);
        t.ok(!!user, 'cgroup', 'a service cgroup is recognised');
        t.equal(user.unit, 'llama-server.service', 'cgroup',
            'the *last* .service in the path — the first match would be user@1000.service, systemd\'s own manager');
        t.equal(user.scope, 'user', 'cgroup', 'a unit under user@1000.service is a user unit, so --user applies');
        const system = unitFromCgroup(CGROUP_SYSTEM);
        t.equal(system.unit, 'ollama.service', 'cgroup', 'a system-slice unit is read the same way');
        t.equal(system.scope, 'system', 'cgroup',
            'but marked system: this extension never acts on one, because it would need root');
        t.equal(unitFromCgroup(CGROUP_USER_MANAGER), undefined, 'cgroup',
            'the user manager\'s own scope is not a service — nothing to start or stop');
        t.equal(unitFromCgroup(CGROUP_SHELL_SCOPE), undefined, 'cgroup',
            'a process started from a shell has no unit, which is exactly what the panel then says');
        t.equal(unitFromCgroup(''), undefined, 'cgroup', 'no cgroup is no answer');
    }

    // ---------- 3) finding the service while it is stopped ----------
    t.section('the unit file: how a stopped service is still found');
    {
        const units = llamaUnitsFromUnitFiles([{ name: 'llama-server.service', text: UNIT_FILE }]);
        t.equal(units.length, 1, 'unitfiles', 'the developer\'s own unit is found');
        t.equal(units[0], 'llama-server.service', 'unitfiles', 'by name, because that is what systemctl needs');
        // The regression this pins: this unit writes ExecStart over nine lines with trailing backslashes, so a
        // parser that only read the first line would see `/home/niel/llama.cpp/build/bin/llama-server` — and
        // one that only read the first line *of the flags* would see `-m` and no binary at all.
        const joined = llamaUnitsFromUnitFiles([{ name: 'llama-server.service', text: UNIT_FILE.replace(/\\\n/g, '\n') }]);
        t.equal(joined.length, 1, 'unitfiles', 'the flags being on separate lines does not hide the binary');
        t.equal(llamaUnitsFromUnitFiles([{ name: 'ollama.service', text: '[Service]\nExecStart=/usr/bin/ollama serve\n' }]).length,
            0, 'unitfiles', 'a unit that starts something else is not a candidate');
        t.equal(llamaUnitsFromUnitFiles([{
            name: 'prep.service',
            text: '[Service]\nExecStartPre=/usr/bin/llama-server --version\nExecStart=/usr/bin/true\n'
        }]).length, 0, 'unitfiles', 'ExecStartPre is not ExecStart — a check is not a server');
    }

    // ---------- 4) the facts systemd reports ----------
    t.section('systemctl show: since when, and does it come back?');
    {
        const facts = parseSystemctlShow(SHOW);
        t.equal(facts.enabled, true, 'unit', 'enabled at login is read, and that is the answer to "who started it?"');
        t.equal(facts.pid, 1918, 'unit', 'the main pid comes back so the panel can name it');
        t.equal(facts.since, 'Tue 2026-09-15 20:04:49 SAST', 'unit', 'so does the time it became active');
        const never = parseSystemctlShow('UnitFileState=disabled\nMainPID=0\nActiveEnterTimestamp=n/a');
        t.equal(never.since, undefined, 'unit', '`n/a` is not a date — a unit that never ran has no uptime');
        t.equal(never.pid, undefined, 'unit', 'and pid 0 is no pid');
        t.equal(never.enabled, false, 'unit', 'a disabled unit says so, so nobody gets told it returns at login');
    }

    // ---------- 5) how the owner is described ----------
    t.section('the sentence that answers "who started it?"');
    {
        const unit = describeOwner({
            kind: 'unit', unit: 'llama-server.service', scope: 'user',
            pid: 1918, since: 'Tue 2026-09-15 20:04:49 SAST', enabled: true
        });
        t.ok(/llama-server\.service/.test(unit), 'describe', 'the unit is named');
        t.ok(/systemd user unit/.test(unit), 'describe', 'and its nature, because that decides how it is stopped');
        t.ok(/active since Tue 2026-09-15 20:04:49 SAST/.test(unit), 'describe', 'with the uptime — the thing that says "not me"');
        t.ok(/enabled at login/.test(unit), 'describe',
            'and whether it comes back by itself, which is the difference between "someone started it" and "it starts itself"');
        const system = describeOwner({ kind: 'unit', unit: 'ollama.service', scope: 'system', pid: 5 });
        t.ok(/needs root/.test(system), 'describe', 'a system unit says why the Stop button cannot do it');
        const proc = describeOwner({ kind: 'process', pid: 4242, since: 'Mon 2026-09-01 08:00:00', command: 'llama-server -m x.gguf' });
        t.ok(/pid 4242/.test(proc) && /started outside systemd/.test(proc), 'describe',
            'a plain process is reported as what it is, with its command line');
        t.ok(/this window/.test(describeOwner({ kind: 'ours', pid: 7 })), 'describe', 'our own child is named as ours');
        t.equal(describeOwner({ kind: 'none' }), 'not running', 'describe', 'and an empty port says so');
    }

    // ---------- 6) the ports and the setting ----------
    t.section('the endpoint and the remembered choice');
    {
        t.equal(endpointPort('http://127.0.0.1:8080/v1'), 8080, 'port', 'a llama.cpp address yields its port');
        t.equal(endpointPort('http://127.0.0.1:1234'), 1234, 'port', 'with or without a path');
        t.equal(endpointPort(''), undefined, 'port', 'an empty setting yields no port rather than 0');
        t.equal(endpointPort('http://localhost/v1'), undefined, 'port', 'and an address without a port is left alone');
        t.equal(startTarget(), 'unit', 'target',
            'the default is the unit: on a machine that has one, that is the server the user meant');
        t.ok(/startTarget[\s\S]*llamaServerStartTarget/.test(read('src/llamaService.ts')), 'target',
            'and the choice is the setting the panel writes, so both front doors agree');
    }

    // ---------- 7) the status dialog ----------
    t.section('the status dialog says who holds it');
    {
        const elsewhere = { endpoint: 'http://127.0.0.1:8080/v1', port: 8080, modelId: 'qwen3-coder-local' };
        const withOwner = llamaServerStatusLines({}, elsewhere, describeOwner({
            kind: 'unit', unit: 'llama-server.service', scope: 'user', pid: 1918, enabled: true
        }));
        t.ok(/llama-server\.service/.test(withOwner[1]), 'status', 'the owner line names the unit');
        t.ok(/Start \/ Stop in ⚙ Settings/.test(withOwner[1]), 'status',
            'and points at the control that can now stop it — the sentence this replaced said no button would');
        t.ok(!/leave it alone/.test(withOwner[1]), 'status', 'the old shrug is gone when the owner is known');
        const withoutOwner = llamaServerStatusLines({}, elsewhere);
        t.ok(/leave it alone/.test(withoutOwner[1]), 'status',
            'with no owner detected the old sentence stands: guessing would be worse than admitting');
    }

    // ---------- 8) wiring: the panel, the webview, the commands ----------
    t.section('wiring: the controls exist and are reachable');
    {
        const panel = read('src/designerPanel.ts');
        for (const id of ['aiLlamaTarget', 'aiLlamaStart', 'aiLlamaStop', 'aiLlamaOwner']) {
            t.ok(new RegExp(`id="${id}"`).test(panel), 'wiring', `the Settings panel has #${id}`);
        }
        t.ok(/case 'aiLlamaStart'[\s\S]*?startLlamaServerByChoice/.test(panel), 'wiring',
            'Start goes through the choice-and-fallback path, not straight at a process');
        t.ok(/case 'aiLlamaStop'[\s\S]*?stopLlamaServerConfirmed/.test(panel), 'wiring',
            'Stop goes through the confirmed path, which is the only stop this extension offers');
        t.ok(/case 'aiLlamaTarget'/.test(panel) && /llamaServerStartTarget/.test(panel), 'wiring',
            'and the dropdown writes its setting, so the choice survives a reload');
        t.ok(/fellBack && outcome\.why/.test(panel), 'wiring',
            'a fallback is reported with the reason the chosen way failed, never silently');

        const js = read('media/designer.js');
        t.ok(/post\(\{ type: 'aiLlamaStart', target:/.test(js), 'wiring', 'the webview posts the Start intent');
        t.ok(/post\(\{ type: 'aiLlamaStop' \}\)/.test(js), 'wiring', 'and the Stop intent');
        t.ok(/function renderLlamaServer\(server\)/.test(js), 'wiring', 'the owner line has a renderer of its own');
        t.ok(/renderLlamaServer\(state\.llamaServer\)/.test(js), 'wiring', 'which the state fills in');
        t.ok(/els\.aiLlamaStart, els\.aiLlamaStop\]/.test(js), 'wiring',
            'both buttons are disabled while an action runs, like the other AI actions');
        t.ok(/aiLlamaStart[\s\S]{0,40}aiLlamaStop/.test(js.match(/\['aiEnabled'[\s\S]*?\]\.forEach/)?.[0] ?? ''), 'wiring',
            'and greyed out with the rest of the section when the host check refuses the machine');

        const ext = read('src/extension.ts');
        t.ok(/registerCommand\('avaloniaDesigner\.assistant\.startLlamaServer'/.test(ext), 'wiring',
            'the palette Start command is registered');
        t.ok(/startLlamaServerByChoice\(startTarget\(\)\)/.test(ext), 'wiring',
            'and it uses the same setting the panel\'s dropdown writes');
        t.ok(/startMyLlamaServerFlow\(context\)[\s\S]{0,200}showWarningMessage\(outcome\.message\)/.test(ext), 'wiring',
            'falling back to the interactive picker, and saying why nothing started if that is cancelled too');
        t.ok(/registerCommand\('avaloniaDesigner\.assistant\.stopLlamaServer', async/.test(ext)
            && /stopLlamaServerConfirmed\(\)/.test(ext), 'wiring',
            'the palette Stop command stops whatever holds the port, after the dialog');

        const src = read('src/llamaService.ts');
        t.ok(/showWarningMessage\(message, \{ modal: true \}/.test(src), 'stop',
            'every stop asks in a modal dialog first, whatever it turns out to be (the user\'s decision)');
        t.ok(/'Stop it',\s*\n\s*'Cancel'/.test(src), 'stop', 'with "Stop it" as the confirming action');
        t.ok(/systemctl', \['--user', 'stop', owner\.unit\]/.test(src), 'stop',
            'a user unit is stopped through systemd, so systemd\'s own state stays true');
        t.ok(/sudo systemctl stop \$\{owner\.unit\}/.test(src), 'stop',
            'a system unit is never acted on: the command is printed for a terminal instead');
        t.ok(/looksLikeLlama/.test(src) && /SIGTERM/.test(src), 'stop',
            'a plain process is signaled only when ss named it a llama-server');
        t.ok(/Nothing was stopped/.test(src), 'stop', 'and otherwise nothing is touched at all');
        t.ok(/fellBack: true, why: first\.message/.test(src), 'start',
            'the start carries the failed route\'s own words into the fallback');

        const manifest = JSON.parse(read('package.json'));
        const conf = manifest.contributes.configuration;
        const props = (Array.isArray(conf) ? conf[0] : conf).properties;
        t.equal(props['avaloniaDesigner.assistant.llamaServerService'].type, 'string', 'wiring',
            'the unit is a setting, because guessing between two units is worse than being told');
        t.equal(props['avaloniaDesigner.assistant.llamaServerStartTarget'].default, 'unit', 'wiring',
            'the start target defaults to the unit');
        const target = props['avaloniaDesigner.assistant.llamaServerStartTarget'];
        t.equal(target.enum.join(','), 'unit,process', 'wiring', 'both ways of starting it are declared');
        t.ok(target.enumDescriptions.some((d) => /systemd user unit/.test(d)), 'wiring',
            'and each is described by what it actually does, so the choice is not a coin toss');
    }
};
