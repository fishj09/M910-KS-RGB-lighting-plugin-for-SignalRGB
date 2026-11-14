// ============================================================================
// SignalRGB Plugin: Redragon M910-KS (Ranger Lite) Wireless / Wired Gaming Mouse
// VID: 0x258A | PIDs: 0x002E (Wired), 0x002F (2.4GHz Wireless)
// Reverse-Engineered & Created by: shananigins
// ============================================================================

export function Name() { return "Redragon M910-KS Mouse"; }
export function VendorId() { return 0x258A; }
export function ProductId() { return new Array(0x002E, 0x002F); }
export function Publisher() { return "shananigins (Redragon)"; }
export function Size() { return new Array(2, 1); }
export function LedNames() { return new Array("Side Lights", "Scroll Wheel"); }
export function LedPositions() { return new Array(new Array(0, 0), new Array(1, 0)); }
export function Type() { return "Hid"; }
export function DefaultPosition() { return new Array(0, 0); }
export function DefaultScale() { return 8.0; }
export function DeviceType() { return "mouse"; }

export function ControllableParameters() {
    return new Array(
        { "property": "LightingMode", "label": "Lighting Mode", "type": "combobox", "values": new Array("Canvas", "Static"), "default": "Canvas" },
        { "property": "staticColor", "label": "Static Side Color", "type": "color", "default": "#ffff00" },
        { "property": "sideBrightness", "label": "Side Lights Brightness (%)", "type": "number", "min": 0, "max": 100, "default": 100 },
        { "property": "wheelMode", "label": "Scroll Wheel Mode", "type": "combobox", "values": new Array("DPI Indicator (Solid)", "Sync with SignalRGB"), "default": "DPI Indicator (Solid)" },
        { "property": "activeDpiStage", "label": "Active DPI & Wheel Color", "type": "combobox", "values": new Array("1: 750 DPI (Red)", "2: 1200 DPI (Blue)", "3: 1750 DPI (Green)", "4: 2000 DPI (Pink)", "5: 2750 DPI (Yellow)"), "default": "3: 1750 DPI (Green)" },
        { "property": "pollingRate", "label": "USB Polling Rate", "type": "combobox", "values": new Array("1000Hz", "500Hz", "250Hz", "125Hz"), "default": "500Hz" },
        { "property": "greenBalance", "label": "Yellow/Green Balance (%)", "type": "number", "min": 40, "max": 100, "default": 85 },
        { "property": "colorOrder", "label": "Color Channel Order", "type": "combobox", "values": new Array("RGB", "RBG", "GRB", "BRG"), "default": "RGB" },
        { "property": "wiredThrottleMs", "label": "Wired Update Rate (ms)", "type": "number", "min": 40, "max": 250, "default": 65 },
        { "property": "wirelessThrottleMs", "label": "Wireless Safe Update Rate (ms)", "type": "number", "min": 80, "max": 500, "default": 110 },
        { "property": "colorThreshold", "label": "Color Change Sensitivity", "type": "number", "min": 1, "max": 30, "default": 4 }
    );
}

export function Validate(endpoint) {
    return endpoint.interface === 1 &&
           endpoint.usage === 0x0001 &&
           endpoint.usage_page === 0xff00 &&
           (endpoint.collection === 0x0003 || endpoint.collection === 0x0005);
}

function isWireless() {
    return device.productId() === 0x002F;
}

function sendCol5Cmd(cmdByte) {
    device.set_endpoint(1, 0x0001, 0xff00, 0x0005);
    let pkt = new Array(8).fill(0);
    pkt.splice(0, 1, 5);
    pkt.splice(1, 1, cmdByte);
    device.send_report(pkt, 8);
}

function applyChannelOrder(r, g, b) {
    if (colorOrder === "RBG") return new Array(r, b, g);
    if (colorOrder === "GRB") return new Array(g, r, b);
    if (colorOrder === "BRG") return new Array(b, r, g);
    return new Array(r, g, b);
}

function parseHexColor(colorVal) {
    let hex = String(colorVal).replace("#", "");
    if (hex.length === 3) {
        hex = hex.split("").map(function(c) { return c + c; }).join("");
    }
    let num = parseInt(hex, 16) || 0;
    return new Array((num >> 16) & 0xFF, (num >> 8) & 0xFF, num & 0xFF);
}

function getPollingByte() {
    if (typeof pollingRate === "undefined") return 4;
    if (pollingRate === "125Hz") return 1;
    if (pollingRate === "250Hz") return 2;
    if (pollingRate === "500Hz") return 4;
    return 8; // 1000Hz
}

function getSelectedDpiConfig() {
    if (typeof activeDpiStage !== "undefined") {
        if (activeDpiStage.indexOf("1:") === 0) return { step: 3, r: 255, g: 0, b: 0 };     // 750 DPI - Red
        if (activeDpiStage.indexOf("2:") === 0) return { step: 5, r: 0, g: 0, b: 255 };     // 1200 DPI - Blue
        if (activeDpiStage.indexOf("4:") === 0) return { step: 8, r: 255, g: 0, b: 255 };   // 2000 DPI - Pink
        if (activeDpiStage.indexOf("5:") === 0) return { step: 11, r: 255, g: 255, b: 0 };  // 2750 DPI - Yellow
    }
    return { step: 7, r: 0, g: 255, b: 0 }; // Default 3: 1750 DPI - Green
}

function buildRedragon520Packet(rawR, rawG, rawB, wheelRgb, syncWheel, wireless) {
    let pkt = new Array(520).fill(0);
    pkt.splice(0, 1, 8);

    const brightScale = (typeof sideBrightness === "undefined" ? 100 : Math.max(0, Math.min(100, sideBrightness))) / 100.0;
    const gScale = (typeof greenBalance === "undefined" ? 85 : greenBalance) / 100.0;

    const scaledR = Math.round(rawR * brightScale);
    const scaledG = Math.round(rawG * gScale * brightScale);
    const scaledB = Math.round(rawB * brightScale);

    const ordered = applyChannelOrder(scaledR, scaledG, scaledB);
    const r = ordered.slice(0, 1).pop();
    const g = ordered.slice(1, 2).pop();
    const b = ordered.slice(2, 3).pop();

    const modeHeader = wireless ? 33 : 17;
    const pollByte = getPollingByte();
    const sel = getSelectedDpiConfig();

    let wr = sel.r, wg = sel.g, wb = sel.b;
    let dStep = sel.step;

    if (syncWheel) {
        const wOrdered = applyChannelOrder(
            wheelRgb.slice(0, 1).pop() || 0,
            wheelRgb.slice(1, 2).pop() || 0,
            wheelRgb.slice(2, 3).pop() || 0
        );
        wr = wOrdered.slice(0, 1).pop();
        wg = wOrdered.slice(1, 2).pop();
        wb = wOrdered.slice(2, 3).pop();
    }

    const bytes = new Array(
        modeHeader, 0, 146, 0, 0, 0, 0, 100, 19, pollByte, 85,
        0, dStep, 0, dStep, 0, dStep, 0, dStep, 0, dStep,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        wr, wg, wb,
        wr, wg, wb,
        wr, wg, wb,
        wr, wg, wb,
        wr, wg, wb,
        wr, wg, wb,
        wr, wg, wb, 255,
        70, 0, 2, 66, 1, 64, r, g, b, 66, 7, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 0, 255, 255, 255, 0, 255, 128,
        0, 0, 255, 255, 2, 66, 64, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 0, 255, 255, 255, 0, 255, 255,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 66, 255, 0, 0, 0, 255, 0, 66, 66, 2, 255, 0, 0, 0, 0, 1, 2,
        255, 0, 0, 165
    );

    for (let i = 0; i < bytes.length; i++) {
        let val = bytes.slice(i, i + 1).pop();
        pkt.splice(i + 1, 1, val);
    }

    return pkt;
}

function sendColorBlock(r, g, b, wheelRgb, syncWheel, isInitOrShutdown) {
    const wireless = isWireless();

    if (isInitOrShutdown) {
        sendCol5Cmd(wireless ? 33 : 17);
        device.pause(15);
    }

    device.set_endpoint(1, 0x0001, 0xff00, 0x0003);
    const packet = buildRedragon520Packet(r, g, b, wheelRgb, syncWheel, wireless);
    device.send_report(packet, 520);
}

export function Initialize() {
    const sel = getSelectedDpiConfig();
    sendColorBlock(0, 255, 0, new Array(sel.r, sel.g, sel.b), false, true);
}

let lastR = -1;
let lastG = -1;
let lastB = -1;
let lastStateKey = "";
let lastUpdateTime = 0;

function sendColorsToDevice(r, g, b, wheelRgb, syncWheel, isStatic) {
    const stateKey = sideBrightness + "|" + greenBalance + "|" + activeDpiStage + "|" + pollingRate + "|" + wheelMode + "|" + (syncWheel ? wheelRgb.join(",") : "");

    if (isStatic) {
        if (r === lastR && g === lastG && b === lastB && stateKey === lastStateKey) return;
        lastR = r;
        lastG = g;
        lastB = b;
        lastStateKey = stateKey;
        sendColorBlock(r, g, b, wheelRgb, syncWheel, false);
        return;
    }

    const wireless = isWireless();
    const throttle = wireless
        ? (typeof wirelessThrottleMs === "undefined" ? 110 : Math.max(80, wirelessThrottleMs))
        : (typeof wiredThrottleMs === "undefined" ? 65 : wiredThrottleMs);

    const now = Date.now();
    const settingsChanged = (lastStateKey !== "" && stateKey !== lastStateKey);
    if (!settingsChanged && now - lastUpdateTime < throttle) return;

    const thresh = (typeof colorThreshold === "undefined" ? 4 : colorThreshold) + (wireless ? 2 : 0);
    const diff = Math.abs(r - lastR) + Math.abs(g - lastG) + Math.abs(b - lastB);
    if (!settingsChanged && lastR !== -1 && diff < thresh) return;

    lastR = r;
    lastG = g;
    lastB = b;
    lastStateKey = stateKey;
    lastUpdateTime = now;

    sendColorBlock(r, g, b, wheelRgb, syncWheel, false);
}

export function Render() {
    const isStatic = (LightingMode === "Static");
    const rgb = isStatic ? parseHexColor(staticColor) : device.color(0, 0);
    const r = rgb.slice(0, 1).pop() || 0;
    const g = rgb.slice(1, 2).pop() || 0;
    const b = rgb.slice(2, 3).pop() || 0;

    const syncWheel = (typeof wheelMode !== "undefined" && wheelMode === "Sync with SignalRGB" && !isStatic);
    const wheelRgb = syncWheel ? device.color(1, 0) : new Array(0, 0, 0);

    sendColorsToDevice(r, g, b, wheelRgb, syncWheel, isStatic);
}

export function Shutdown() {
    sendColorBlock(0, 0, 0, new Array(0, 0, 0), false, true);
}
