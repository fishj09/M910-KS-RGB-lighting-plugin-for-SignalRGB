// ============================================================================
// SignalRGB Plugin: Redragon M910-KS (Ranger Lite) Wireless / Wired Gaming Mouse
// VID: 0x258A | PIDs: 0x002E (Wired), 0x002F (2.4GHz Wireless)
// Reverse-Engineered & Created by: shananigins
// ============================================================================

export function Name() { return "Redragon M910-KS Mouse"; }
export function VendorId() { return 0x258A; }
export function ProductId() { return new Array(0x002E, 0x002F); }
export function Publisher() { return "shananigins (Redragon)"; }
export function Size() { return new Array(1, 1); }
export function LedNames() { return new Array("LED"); }
export function LedPositions() { return new Array(new Array(0, 0)); }
export function Type() { return "Hid"; }
export function DefaultPosition() { return new Array(0, 0); }
export function DefaultScale() { return 8.0; }
export function DeviceType() { return "mouse"; }
export function ImageUrl() { return "https://signalrgb.com"; }

export function ControllableParameters() {
    return new Array(
        { "property": "LightingMode", "label": "Lighting Mode", "type": "combobox", "values": new Array("Canvas", "Static"), "default": "Canvas" },
        { "property": "staticColor", "label": "Static Color", "type": "color", "default": "#00ff00" },
        { "property": "connectionMode", "label": "Connection Mode", "type": "combobox", "values": new Array("Wireless (0x002F)", "Wired (0x002E)"), "default": "Wireless (0x002F)" },
        { "property": "frameThrottleMs", "label": "Frame Throttle (ms)", "type": "number", "min": 50, "max": 2000, "default": 150 }
    );
}

export function Validate(endpoint) {
    if (endpoint.interface === 1 && endpoint.usage === 0x0001) {
        if (endpoint.usage_page === 0xff00 && (endpoint.collection === 0x0003 || endpoint.collection === 0x0005)) return true;
    }
    return false;
}

function isWireless() {
    return (typeof connectionMode === "undefined" || connectionMode === "Wireless (0x002F)");
}

function sendCol5Cmd(cmdByte) {
    device.set_endpoint(1, 0x0001, 0xff00, 0x0005);
    let pkt = new Array(65).fill(0);
    pkt.splice(0, 1, 5);
    pkt.splice(1, 1, cmdByte);
    device.send_report(pkt, 65);
}

function buildRedragon520Packet(r, g, b, wireless) {
    let pkt = new Array(520).fill(0);
    pkt.splice(0, 1, 8);

    // Exact captured Wireless (#5111) & Wired (#74) 520-byte profile block:
    // - Wireless uses header 33 (0x21) and fixed end byte 255
    // - Wired uses header 17 (0x11) and dynamic checkByte
    const modeHeader = wireless ? 33 : 17;
    const endCheck = wireless ? 255 : ((255 ^ ((g * 81) >> 8) ^ ((b * 162) >> 8)) & 0xFF);

    const bytes = new Array(
        modeHeader, 0, 146, 0, 0, 0, 0, 100, 19, 4, 37, 0, 4, 0, 6, 0, 7, 0, 12, 0, 16,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        255, 0, 0, 0, 0, 255, 0, 255, 0, 255, 0, 255, 255, 255, 0, 0, 255, 255, 255, 255, 255, 255,
        70, 0, 2, 66, 1, 64, r, g, b, 66, 7, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 0, 255, 255, 255, 0, 255, 128,
        0, 0, 255, 255, 2, 66, 64, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 0, 255, 255, 255, 0, 255, 255,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 66, 255, 0, 0, 0, 255, 0, 66, 66, 2, 255, 0, 0, 0, 0, 1, 2,
        endCheck, 0, 0, 165
    );

    for (let i = 0; i < bytes.length; i++) {
        let val = bytes.slice(i, i + 1).pop();
        pkt.splice(i + 1, 1, val);
    }

    return pkt;
}

function sendColorBlock(r, g, b) {
    const wireless = isWireless();

    // Step 1: Send #5107 (0x05 0x21 / 33 for Wireless) or #70 (0x05 0x11 / 17 for Wired) on Col 0x05
    sendCol5Cmd(wireless ? 33 : 17);

    // Exact 58ms delay measured between #5107 (05:39:35.895) and #5111 (05:39:35.954)
    device.pause(wireless ? 60 : 45);

    // Step 2: Send #5111 (520-byte Report ID 8) on Col 0x03
    device.set_endpoint(1, 0x0001, 0xff00, 0x0003);
    const pkt520 = buildRedragon520Packet(r, g, b, wireless);
    device.send_report(pkt520, 520);
}

export function Initialize() {
    sendColorBlock(0, 255, 0);
}

function parseHexColor(colorVal) {
    let hex = String(colorVal).replace("#", "");
    if (hex.length === 3) {
        hex = hex.split("").map(function(c) { return c + c; }).join("");
    }
    let num = parseInt(hex, 16);
    return new Array((num >> 16) & 0xFF, (num >> 8) & 0xFF, num & 0xFF);
}

let lastR = -1;
let lastG = -1;
let lastB = -1;
let lastUpdateTime = 0;

function sendColorsToDevice(r, g, b) {
    const throttle = typeof frameThrottleMs === "undefined" ? 150 : frameThrottleMs;
    const now = Date.now();
    if (now - lastUpdateTime < throttle) return;

    if (r === lastR && g === lastG && b === lastB) return;
    lastR = r;
    lastG = g;
    lastB = b;
    lastUpdateTime = now;

    sendColorBlock(r, g, b);
}

export function Render() {
    const rgb = (LightingMode === "Static") ? parseHexColor(staticColor) : device.color(0, 0);
    const r = rgb.slice(0, 1).pop() || 0;
    const g = rgb.slice(1, 2).pop() || 0;
    const b = rgb.slice(2, 3).pop() || 0;
    sendColorsToDevice(r, g, b);
}

export function Shutdown() {
    sendColorsToDevice(0, 0, 0);
}
