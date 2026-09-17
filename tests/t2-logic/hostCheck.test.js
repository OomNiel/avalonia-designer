/* T2 — the host check (`src/hostCheck.ts`), asked 2026-09-17.
 *
 * *"the extension must check the resources of the host pc. If it has less than 32 GB ram and an integrated
 * GPU, or it has less than 16 GB ram and a separate GPU with less than 4 GB VRAM, the AI assistance feature
 * must be greyed out with an explanation."* … *"we also have to warn the user if his system complies with the
 * above ram requirements, but less than 20GB total memory is available to the local model."*
 *
 * Two of those numbers were re-decided with the user the same day, because the rules as written would have
 * greyed the feature out on their OWN machine — 28 GB RAM with an integrated Radeon 760M, the box that loads a
 * 3B model in 602 ms on Vulkan:
 *   · **available memory decides, not total** (free RAM + a real card's VRAM);
 *   · an **escape hatch** ("Use it anyway") so an eGPU or an undetected card cannot lock anyone out.
 *
 * What is proven here, with fixture strings instead of hardware:
 *   1. the GPU probe's parsing: `lspci`, `nvidia-smi`, Windows `AdapterRAM`, macOS `system_profiler` — and
 *      that a non-display PCI device can never be mistaken for the GPU;
 *   2. a device is credited VRAM only when it is positively a card (the conservative direction);
 *   3. an APU's carve-out is NOT added to the memory budget (the same gigabytes twice);
 *   4. the verdicts: a weak laptop is blocked with an actionable reason, a 16 GB machine with 5 GB free is
 *      blocked, a 3 GB card is "no help" but does not block, a real card's VRAM is added;
 *   5. the 20 GB warning, and that it never blocks;
 *   6. the escape hatch, and that the block message says where to find it;
 *   7. the wiring: banner, declared setting, greyed controls, and the AI commands refusing.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const hc = require('../../out/hostCheck.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Real-ish hardware facts, overridden per case. */
const facts = (over = {}) => ({
    arch: 'x64', cpuCount: 12, totalRamGb: 28, freeRamGb: 16, hasAvx2: true, platform: 'linux', ...over
});

// `lspci -mm` on the user's box: the display device, plus the USB4 bridge that used to be mistaken for it.
const LSPCI_APU = [
    '66:00.0 "VGA compatible controller" "Advanced Micro Devices, Inc. [AMD/ATI]" "Phoenix1" -rc3 -p00 "Unknown vendor 2014" "Phoenix1"',
    '66:00.1 "USB controller" "Advanced Micro Devices, Inc. [AMD]" "Family 19h USB4/Thunderbolt PCIe tunnel" -p30 "Advanced Micro Devices, Inc. [AMD]" "Device 14e8"'
].join('\n');
const LSPCI_NVIDIA = '01:00.0 "VGA compatible controller" "NVIDIA Corporation" "GA106 [GeForce RTX 3060]" -ra1 -p00 "ASUS" "RTX 3060"';

module.exports = async (t) => {
    t.section('the host check');

    // ---------- 1) what the probe reads ----------
    {
        const apu = hc.classifyGpu({ platform: 'linux', lspci: LSPCI_APU, sysfsVramGb: 3, cpuModel: 'AMD Ryzen 7 8845HS' });
        t.equal(apu.kind, 'integrated', 'parse', 'an AMD APU is integrated, not a card');
        t.ok(/Phoenix1/.test(apu.name), 'parse', 'named from its display device');
        t.equal(/USB4|Thunderbolt/.test(apu.name), false, 'parse',
            'and never from a PCI device that is not a display — the check picked the USB4 bridge before');
        t.equal(apu.vramGb, 3, 'parse', 'its carve-out is read (3 GB on the machine this was written on)');

        const card = hc.classifyGpu({ platform: 'linux', lspci: LSPCI_NVIDIA, nvidiaSmi: 'NVIDIA GeForce RTX 3060, 12288 MiB', sysfsVramGb: 12 });
        t.equal(card.kind, 'discrete', 'parse', 'an NVIDIA card is discrete');
        t.equal(card.vramGb, 12, 'parse', 'with the VRAM nvidia-smi reports');
        t.equal(card.source, 'nvidia-smi', 'parse', 'and the source is named, so a wrong verdict can be traced');

        const win = hc.classifyGpu({ platform: 'win32', winControllers: ['Intel(R) UHD Graphics 630|1073741824'] });
        t.equal(win.kind, 'integrated', 'parse', 'an Intel iGPU on Windows is integrated');
        const winCard = hc.classifyGpu({ platform: 'win32', winControllers: ['NVIDIA GeForce RTX 4070|4293918720'] });
        t.equal(winCard.kind, 'discrete', 'parse', 'a Windows card is discrete even though AdapterRAM saturates');

        const mac = hc.classifyGpu({ platform: 'darwin', macDisplays: '{"SPDisplaysDataType":[{"sppci_model":"Apple M3 Pro"}]}' });
        t.equal(mac.kind, 'integrated', 'parse', 'an Apple GPU is unified memory, i.e. integrated');
        t.ok(/M3 Pro/.test(mac.name), 'parse', 'named');

        const none = hc.classifyGpu({ platform: 'linux' });
        t.equal(none.kind, 'none', 'parse', 'a machine with nothing readable reports none');
        t.equal(none.vramGb, 0, 'parse', 'and adds no memory');

        // A device is only credited VRAM when it is positively a card: an unknown name is treated as
        // integrated, which can only under-count (never let a machine through on memory it does not have).
        const unknown = hc.classifyGpu({ platform: 'linux', lspci: '03:00.0 "VGA compatible controller" "X Corp" "Mystery 9000" -p00 "X" "Y"', sysfsVramGb: 8 });
        t.equal(unknown.kind, 'integrated', 'parse', 'an unrecognised device is not credited VRAM');
    }

    // ---------- 2) the verdict ----------
    {
        // The user's own machine: 28 GB total, 16 GB free, integrated APU — must NOT be blocked.
        const mine = hc.assessHost(facts(), { kind: 'integrated', name: 'AMD Phoenix1', vramGb: 3, source: 'lspci' });
        t.equal(mine.aiAllowed, true, 'verdict', 'the machine this was built on keeps the AI assist');
        t.equal(mine.availableGb, 16, 'verdict', "its APU's carve-out is NOT added: that memory is part of the 16 GB");
        t.ok(mine.warning, 'verdict', 'but the tight-memory warning fires here (16 < 20 GB), as the user described');
        t.ok(/16\.0 GB/.test(mine.warning), 'verdict', 'naming the memory available');
        t.equal(mine.reasons.length, 0, 'verdict', 'with no reason to refuse anything');

        const weak = hc.assessHost(facts({ totalRamGb: 16, freeRamGb: 5 }), { kind: 'integrated', name: 'Intel UHD', vramGb: 0, source: 'lspci' });
        t.equal(weak.aiAllowed, false, 'verdict', 'a 16 GB laptop with 5 GB free is blocked');
        t.ok(/5\.0 GB of memory is available/.test(weak.reasons[0]), 'verdict', 'saying how much is available');
        t.ok(/needs about 8 GB/.test(weak.reasons[0]), 'verdict', 'how much the smallest model needs');
        t.ok(/Close some applications/.test(weak.reasons[0]), 'verdict', 'and what the user can do about it');

        const smallCard = hc.assessHost(facts({ totalRamGb: 16, freeRamGb: 12 }), { kind: 'integrated', name: 'NVIDIA GeForce GTX 1650', vramGb: 3, source: 'nvidia-smi' });
        t.equal(smallCard.aiAllowed, true, 'verdict',
            'a 3 GB card does not block by itself — the RAM has to be short too');
        t.equal(smallCard.availableGb, 12, 'verdict', 'and its VRAM is not counted (under the 4 GB the user drew)');

        const shortWithCard = hc.assessHost(facts({ totalRamGb: 16, freeRamGb: 4 }), { kind: 'integrated', name: 'NVIDIA GeForce GTX 1650', vramGb: 3, source: 'nvidia-smi' });
        t.equal(shortWithCard.aiAllowed, false, 'verdict', '4 GB free with a useless card is blocked');
        t.ok(/under the 4 GB/.test(shortWithCard.reasons.join(' ')), 'verdict',
            'and the card is named as no help, so the advice is not "buy more RAM" alone');

        const goodCard = hc.assessHost(facts({ freeRamGb: 12, totalRamGb: 32 }), { kind: 'discrete', name: 'NVIDIA GeForce RTX 3060', vramGb: 12, source: 'nvidia-smi' });
        t.equal(goodCard.availableGb, 24, 'verdict', "a real card's VRAM IS added: it is separate memory");
        t.equal(goodCard.aiAllowed, true, 'verdict', 'and 24 GB is comfortable');
        t.equal(goodCard.warning, undefined, 'verdict', 'with no warning at 24 GB');

        // The existing CPU floors still apply — the host check composes them rather than repeating them.
        const noAvx = hc.assessHost(facts({ hasAvx2: false }), { kind: 'discrete', name: 'NVIDIA GeForce RTX 3060', vramGb: 12, source: 'nvidia-smi' });
        t.equal(noAvx.aiAllowed, false, 'verdict', 'a CPU without AVX2 is still refused, whatever the memory');
        t.ok(/AVX2/.test(noAvx.reasons[0]), 'verdict', 'with the reason that applies');

        const overridden = hc.assessHost(facts({ freeRamGb: 5 }), { kind: 'integrated', name: 'Intel UHD', vramGb: 0, source: 'lspci' }, true);
        t.equal(overridden.aiAllowed, true, 'verdict', 'the escape hatch allows it');
        t.equal(overridden.overridden, true, 'verdict', 'and says that it was the hatch, not the hardware');
        t.equal(overridden.reasons.length > 0, true, 'verdict', 'while keeping the reason visible');

        const blocked = hc.hostBlockMessage(weak);
        t.ok(/AI assist is disabled on this machine/.test(blocked), 'message', 'the refusal is one sentence');
        t.ok(/⚙ Settings/.test(blocked), 'message', 'that says where the override lives');
        t.ok(/5\.0 GB/.test(blocked), 'message', 'and carries the reason the machine gave');
    }

    // ---------- 3) wiring ----------
    {
        const panel = read('src/designerPanel.ts');
        t.ok(/<p class="experimental-banner">EXPERIMENTAL FEATURE-USE WITH CAUTION<\/p>/.test(panel), 'wiring',
            'the settings dialog opens with the experimental notice, in the exact words asked for');
        t.ok(/class="settings-section" data-section="codeCheck"/.test(panel)
            && panel.indexOf('experimental-banner') < panel.indexOf('data-section="codeCheck"'), 'wiring',
            'at the very top, above the first section');
        t.ok(/id="aiHostBlocked"/.test(panel) && /id="aiHostWarning"/.test(panel) && /id="aiHostOverride"/.test(panel),
            'wiring', 'the AI section carries the reason, the warning and the escape');
        t.ok(/case 'aiHostOverride':[\s\S]{0,900}?update\('assistant\.ignoreHostCheck', true/.test(panel), 'wiring',
            'and the escape writes the setting (remembered, not just this once)');
        t.ok(/clearHostGate\(\);/.test(panel), 'wiring', 'then re-checks, so the section un-greys from the truth');
        t.ok(/hostGate\(true\)/.test(panel), 'wiring', 'with a fresh probe — the machines RAM has not changed but the decision has');

        const css = read('media/designer.css');
        t.ok(/\.experimental-banner\s*\{[\s\S]{0,220}?font-weight: 700;[\s\S]{0,160}?color: #ff5a5f;/.test(css), 'wiring',
            'the notice is bold and red');
        t.ok(/\.ai-blocked\s*\{/.test(css) && /\.ai-warn\s*\{/.test(css), 'wiring',
            'and the blocked/warning lines are styled to be seen');

        const web = read('media/designer.js');
        t.ok(/function renderAiHost\(state\)/.test(web), 'wiring', 'the panel renders the host verdict');
        t.ok(/const blocked = host\.aiAllowed === false;/.test(web), 'wiring', 'from `host.aiAllowed`');
        t.ok(/\['aiEnabled', 'aiShowDiff', 'aiModel'/.test(web) && /el\.disabled = blocked;/.test(web), 'wiring',
            'greying out every control that could start or configure a model');
        t.ok(/els\.aiHostBlocked\.textContent = blocked[\s\S]{0,120}?host\.reasons/.test(web), 'wiring',
            'showing the reason itself, not just "disabled"');
        t.ok(/post\(\{ type: 'aiHostOverride' \}\)/.test(web), 'wiring', 'and offering the escape');

        const ui = read('src/assistantUi.ts');
        t.ok(/if \(!gate\.aiAllowed\) \{\s*\n\s*void vscode\.window\.showWarningMessage\(hostBlockMessage\(gate\)\);/.test(ui),
            'wiring', '"Fix with AI…" refuses with the same sentence');
        t.ok(/repairWithAI[\s\S]{0,400}?if \(!\(await hostGate\(\)\)\.aiAllowed\)/.test(ui), 'wiring',
            'and so does the repair loop\'s model fallback');

        const ext = read('src/extension.ts');
        t.ok(/void hostGate\(\)\.then\(\(gate\) => \{/.test(ext), 'wiring',
            'the check runs once when the extension activates');
        t.ok(/Host check: \$\{gate\.aiAllowed \? 'AI assist allowed' : 'AI assist disabled'\}/.test(ext), 'wiring',
            'and the verdict goes to the log, with the reasons');

        t.ok(/"avaloniaDesigner\.assistant\.ignoreHostCheck":\s*\{\s*"type": "boolean",\s*"default": false/.test(read('package.json')),
            'wiring', 'the escape is a declared setting, off by default');
        t.ok(/statusFacts[\s\S]{0,600}?await hostGate\(\)/.test(ui), 'wiring',
            'the status dialog reports the same verdict — it is the "hardware check" the user is pointed at');
    }
};
