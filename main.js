function parseTxt(text) {
    const lines = text.split('\n');
    const fps = parseFloat(lines.splice(0, 1));
    const actions = [];
    for (const line of lines) {
        const split = line.trim().split(' ');
        if (split.length !== 3) continue;
        actions.push({
            x: parseFloat(split[0]),
            hold: split[1] === '1',
            player2: split[2] === '1'
        });
    }
    return {fps, actions};
}

/**
 * i just want vscode completions
 * @param {DataView} view 
 */
function parseReplayBot(view) {
    let magic = String.fromCharCode(...new Uint8Array(view.buffer.slice(0, 4)));
    if (magic === 'RPLY') {
        const version = view.getUint8(4);
        if (version === 1 || version === 2) {
            let offset = 0;
            let frame = false;
            if (version === 2) {
                offset = 1;
                frame = view.getUint8(5) === 1;
            }
            const fps = view.getFloat32(5 + offset, true);
            const actions = [];
            for (let i = 9 + offset; i < view.byteLength; i += 5) {
                const x = frame ? view.getUint32(i, true) : view.getFloat32(i, true);
                const state = view.getUint8(i + 4);
                const hold = !!(state & 0x1);
                const player2 = !!(state >> 1);
                actions.push({x, hold, player2});
            }
            return {fps, actions};
        }
    } else {
        const fps = view.getFloat32(0, true);
        const actions = [];
        for (let i = 4; i < view.byteLength; i += 6) {
            const x = view.getFloat32(i, true);
            const hold = view.getUint8(i + 4) === 1;
            const player2 = view.getUint8(i + 5) === 1;
            actions.push({x, hold, player2});
        }
        return {fps, actions};
    }
}

function parseyBot(text) {
    const data = JSON.parse(text);
    const choice = prompt(`which level? ${Object.keys(data)}`);
    if (data[choice]) {
        const fps = 1 / data[choice]['delta_override'];
        const actions = data[choice]['instructions'].map(instruction => {
            return {
                x: instruction.x,
                hold: instruction.press,
                player2: instruction.p2
            };
        });
        return {fps, actions};
    }
}

function parseYbotF(view) {
    const fps = view.getFloat32(4, true);
    const nActions = view.getInt32(8, true);
    const actions = [];
    for (let i = 12; i < 12 + nActions * 8; i += 8) {
        const frame = view.getUint32(i, true);
        const idk = view.getUint32(i + 4, true);
        const hold = (idk & 0b10) === 2;
        const player2 = (idk & 0b01) === 1;
        actions.push({x: frame, hold, player2});
    }
    return {fps, actions};
}

function parsezBot(view) {
    const delta = view.getFloat32(0, true);
    const speedhack = view.getFloat32(4, true);
    const fps = 1 / delta / speedhack
    const actions = [];
    for (let i = 8; i < view.byteLength; i += 6) {
        const x = view.getFloat32(i, true);
        // once again i will make fun of fig for using 0x30 and 0x31
        const hold = view.getUint8(i + 4) === 0x31;
        const player1 = view.getUint8(i + 5) === 0x31;
        actions.push({x, hold, player2: !player1});
    }
    return {fps, actions};
}

function parseZBF(view) {
    const delta = view.getFloat32(0, true);
    const speedhack = view.getFloat32(4, true);
    const fps = 1 / delta / speedhack
    const actions = [];
    for (let i = 8; i < view.byteLength; i += 6) {
        const x = view.getInt32(i, true);
        const hold = view.getUint8(i + 4) === 0x31;
        const player1 = view.getUint8(i + 5) === 0x31;
        actions.push({x, hold, player2: !player1});
    }
    return {fps, actions};
}

/**
 * i just want vscode completions
 * @param {DataView} view 
 */
function parseDDHOR(view) {
    let magic = String.fromCharCode(...new Uint8Array(view.buffer.slice(0, 4)));
    if (magic === 'DDHR') {
        const fps = view.getInt16(4, true);
        const player1ActionCount = view.getInt32(6, true);
        const player2ActionCount = view.getInt32(10, true);
        console.log(player1ActionCount, player2ActionCount);
        const actions = [];
        for (let i = 14; i < view.byteLength; i += 5) {
            const x = view.getFloat32(i, true);
            const action = view.getUint8(i + 4);
            const player2 = i - 14 >= player1ActionCount * 5;
            actions.push({x, hold: action == 0, player2});
        }
        actions.sort((a, b) => a.x - b.x);

        return {fps, actions};
    } else {
        const data = JSON.parse(new TextDecoder().decode(new Uint8Array(view.buffer)));
        let type = data.macro;
        const fps = data.fps;
        if (type === 'x-position') {
            const actions = [
                ...data.inputsP1.map(ipt => {
                    return {
                        x: ipt.position,
                        hold: ipt.action === 'PUSH',
                        player2: false
                    };
                }),
                ...data.inputsP2.map(ipt => {
                    return {
                        x: ipt.position,
                        hold: ipt.action === 'PUSH',
                        player2: true
                    };
                }),
            ];
            actions.sort((a, b) => a.x - b.x);
            return {fps, actions};
        }
    }
}

function parsexBot(text) {
    const lines = text.split('\n');
    const fps = parseInt(lines.splice(0,1)[0].split(' ')[1].trim());
    if (lines[0].trim() !== 'pro_plus') {
        alert('xbot only works with pro+');
        return;
    }
    lines.splice(0,1);
    const actions = [];
    // for converting the x pos
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    for (const line of lines) {
        if (!line.trim()) continue;
        const [state, rawPos] = line.trim().split(' ').map(i => parseInt(i));
        // state:
        // 0 - release
        // 1 - hold
        // 2 - p2 release
        // 3 - p2 hold
        const player2 = state > 1;
        const hold = state % 2 == 1;
        view.setUint32(0, rawPos);
        const x = view.getFloat32(0);
        actions.push({ x, hold, player2 });
    }
    return {fps, actions};
}

function parsexBotFrame(text) {
    const lines = text.split('\n');
    const fps = parseInt(lines.splice(0,1)[0].split(' ')[1].trim());
    if (lines[0].trim() !== 'frames') {
        alert('not a frame');
        return;
    }
    lines.splice(0,1);
    const actions = [];
    for (const line of lines) {
        if (!line.trim()) continue;
        const [state, rawPos] = line.trim().split(' ').map(i => parseInt(i));
        const player2 = state > 1;
        const hold = state % 2 == 1;
        actions.push({ x: parseInt(rawPos), hold, player2 });
    }
    return {fps, actions};
}

function parseKDBot(view) {
    const fps = view.getFloat32(0, true);
    const actions = [];
    for (let i = 4; i < view.byteLength; i += 6) {
        const frame = view.getInt32(i, true);
        const hold = view.getUint8(i + 4) === 1;
        const player2 = view.getUint8(i + 5) === 1;
        actions.push({x: frame, hold, player2});
    }
    return {fps, actions};
}

function parseTASBOT(text, frame=false) {
    const data = JSON.parse(text);
    const fps = data.fps;
    const actions = [];
    for (const action of data.macro) {
        const x = frame ? action.frame : action.player_1.x_position;
        let h;
        if (h = action.player_1.click ?? action.player_1_click)
            actions.push({x, hold: h === 1, player2: false});
        if (h = action.player_2.click ?? action.player_2_click)
            actions.push({x, hold: h === 1, player2: true});
    }
    return {fps, actions};
}

function parseEcho(text, frame) {
    const data = JSON.parse(text);
    const fps = data.FPS;
    // thanks krx
    const startingFrame = data['Starting Frame']; 
    const actions = data['Echo Replay'].map(action => ({
        x: frame ? action.Frame + startingFrame : action['X Position'],
        hold: action.Hold,
        player2: action['Player 2']
    }));
    return {fps, actions};
}

function parseUniversalReplayFormat(view, frame) {
    const fps = view.getFloat32(0, true);
    const type = view.getUint8(4);
    const actions = [];
    for (let i = 5; i < view.byteLength; i += 5) {
        const state = view.getUint8(i);
        const hold = state & 1 === 1;
        const player2 = state >> 1 === 1;
        let x;
        if (type === 2) {
            x = frame ? view.getUint32(i + 5, true) : view.getFloat32(i + 1, true);
            i += 4;
        }
        else
            x = type == 0 ? view.getFloat32(i + 1, true) : view.getUint32(i + 1, true);
        actions.push({x, hold, player2});
    }
    return {fps, actions};
}

function parseRush(view) {
    const fps = view.getInt16(0, true);
    const actions = [];
    for (let i = 2; i < view.byteLength; i += 5) {
        const x = view.getInt32(i, true);
        let state = view.getUint8(i + 4);

        const hold = !!(state & 1);
        const player2 = !!(state >> 1);

        actions.push({x, hold: !!hold, player2: !!player2});
    }
    return {fps, actions};
}

function parseMHRjson(text) {
    const data = JSON.parse(text);
    const fps = data.meta.fps;

    const actions = [];
    for (const action of data.events) {
        if (action.hasOwnProperty("down")) {
            const x = action.frame;
            const hold = action.down;
            actions.push({x, hold, player2: !!action.p2});
        }
    }
    return {fps, actions};
}


function dumpTxt(replay) {
    let final = '';
    final += `${replay.fps}\n`;
    for (let action of replay.actions) {
        final += `${action.x} ${+action.hold} ${+action.player2}\n`
    }
    return final.slice(0, final.length-1);
}

function strToBuf(str) {
    return new Uint8Array(str.split('').map(i => i.charCodeAt()));
}

function dumpReplayBot(replay, frame=false) {
    const buffer = new ArrayBuffer(10 + replay.actions.length * 5);
    const view = new DataView(buffer);
    strToBuf('RPLY').forEach((n, i) => view.setUint8(i, n));
    view.setUint8(4, 2); // version
    view.setUint8(5, +frame); // type
    view.setFloat32(6, replay.fps, true);
    replay.actions.forEach((action, i) => {
        if (frame)
            view.setUint32(10 + i * 5, action.x, true);
        else
            view.setFloat32(10 + i * 5, action.x, true);
        const state = action.hold | (action.player2 << 1);
        view.setUint8(14 + i * 5, state);
    });
    return buffer;
}

function dumpzBot(replay) {
    const buffer = new ArrayBuffer(8 + replay.actions.length * 6);
    const view = new DataView(buffer);
    view.setFloat32(0, 1 / replay.fps, true);
    view.setFloat32(4, 1, true);
    replay.actions.forEach((action, i) => {
        view.setFloat32(8 + i * 6, action.x, true);
        view.setUint8(12 + i * 6, action.hold ? 0x31 : 0x30);
        view.setUint8(13 + i * 6, !action.player2 ? 0x31 : 0x30);
    });
    return buffer;
}

function dumpZBF(replay) {
    const buffer = new ArrayBuffer(8 + replay.actions.length * 6);
    const view = new DataView(buffer);
    view.setFloat32(0, 1 / replay.fps, true);
    view.setFloat32(4, 1, true);
    replay.actions.forEach((action, i) => {
        view.setInt32(8 + i * 6, action.x, true);
        view.setUint8(12 + i * 6, action.hold ? 0x31 : 0x30);
        view.setUint8(13 + i * 6, !action.player2 ? 0x31 : 0x30);
    });
    return buffer;
}

function dumpyBot(replay) {
    return JSON.stringify({
        converted: {
            _reserved: 0,
            delta_override: 1 / replay.fps,
            instructions: replay.actions.map(action => {
                return {
                    x: action.x,
                    press: action.hold,
                    p2: action.player2
                };
            })
        }
    }, null, 2);
}

function dumpYbotF(replay) {
    const buffer = new ArrayBuffer(12 + replay.actions.length * 8);
    const view = new DataView(buffer);
    strToBuf('ybot').forEach((n, i) => view.setUint8(i, n));
    view.setFloat32(4, replay.fps, true);
    view.setUint32(8, replay.actions.length, true);
    replay.actions.forEach((action, i) => {
        view.setInt32(12 + i * 8, action.x, true);
        let idk = action.player2 + action.hold * 2;
        view.setUint32(16 + i * 8, idk);
    });
    return buffer;
}

function dumpDDHOR(replay) {
    const player1Actions = replay.actions.filter(i => !i.player2);
    const player2Actions = replay.actions.filter(i => i.player2);
    return JSON.stringify({
        fps: Math.round(replay.fps),
        levelID: null,
        macro: 'x-position',
        inputsP1: player1Actions.map(action => {
            return {
                action: action.hold ? 'PUSH' : 'RELEASE',
                position: action.x
            };
        }),
        inputsP2: player2Actions.map(action => {
            return {
                action: action.hold ? 'PUSH' : 'RELEASE',
                position: action.x
            };
        })
    });
}

function dumpxBot(replay) {
    let final = `fps: ${Math.round(replay.fps)}\r\npro_plus\r\n`;
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    replay.actions.forEach(action => {
        // amazing
        const state = action.hold + 2 * action.player2;
        view.setFloat32(0, action.x);
        const pos = view.getUint32(0);
        final += `${state} ${pos}\r\n`;
    });
    return final.slice(0, final.length - 1);
}

function dumpxBotFrame(replay) {
    let final = `fps: ${Math.round(replay.fps)}\r\nframes\r\n`;
    replay.actions.forEach(action => {
        const state = action.hold + 2 * action.player2;
        final += `${state} ${Math.floor(action.x)}\r\n`;
    });
    return final.slice(0, final.length - 1);
}

function dumpKDBot(replay) {
    const buffer = new ArrayBuffer(4 + replay.actions.length * 6);
    const view = new DataView(buffer);
    view.setFloat32(0, replay.fps, true);
    replay.actions.forEach((action, i) => {
        view.setUint32(4 + i * 6, action.x, true);
        view.setUint8(8 + i * 6, action.hold);
        view.setUint8(9 + i * 6, action.player2);
    });
    return buffer;
}

function dumpTASBOT(replay, frame=false) {
    const data = {
        fps: replay.fps,
        macro: replay.actions.map(action => {
            return {
                frame: frame ? action.x : 0,
                player_1: {
                    click: +!action.player2 && (!action.hold + 1),
                    x_position: frame ? 0 : action.x
                },
                player_2: {
                    click: +action.player2 && (!action.hold + 1),
                    x_position: frame ? 0 : action.x
                }
            };
        })
    };
    return JSON.stringify(data, null, 1);
}

function dumpEcho(replay, frame) {
    return JSON.stringify({
        FPS: replay.fps,
        'Starting Frame': 0,
        'Echo Replay': replay.actions.map(action => ({
            Hold: action.hold,
            'Player 2': action.player2,
            Frame: frame ? action.x : 0,
            'X Position': frame ? 0 : action.x
        }))
    }, null, 4);
}

function dumpUniversalReplayFormat(replay, frame) {
    const buffer = new ArrayBuffer(5 + replay.actions.length * 5);
    const view = new DataView(buffer);
    view.setFloat32(0, replay.fps, true);
    view.setUint8(4, frame, true);
    replay.actions.forEach((action, i) => {
        const state = action.hold + action.player2 * 2;
        view.setUint8(5 + i * 5, state);
        if (frame)
            view.setUint32(6 + i * 5, action.x, true);
        else
            view.setFloat32(6 + i * 5, action.x, true);
    });
    return buffer;
}

function dumpRush(replay) {
    const buffer = new ArrayBuffer(2 + replay.actions.length * 5);
    const view = new DataView(buffer);
    view.setInt16(0, replay.fps, true);
    replay.actions.forEach((action, i) => {
        const state = action.hold + action.player2 * 2;
        view.setInt32(2 + i * 5, action.x, true);
        view.setUint8(6 + i * 5, state);
    });
    return buffer;
}

function dumpMHRjson(replay) {
    // Does not support any physics.
    const data = {
        "_": "Generated from macro converter",
        "events": replay.actions.map(action => {
            let e = {
                "a": 0, // used for physics
                "down": action.hold,
                "frame": action.x,
                "r": 0, // used for physics
                "x": 0,
                "y": 0
            }
            if (action.player2) e.p2 = true;
            return e;
        }),
        "meta": {"fps": replay.fps}
    }
    return JSON.stringify(data, null, 1);
}

function cleanReplay(replay) {
    let last1 = false;
    let last2 = false;
    let n = 0;
    let final = [];
    replay.actions.forEach(action => {
        if (action.hold == (action.player2 ? last2 : last1)) {
            ++n;
            return;
        }
        if (action.player2) last2 = action.hold;
        else last1 = action.hold;
        final.push(action);
    });
    if (n) console.log(`Removed ${n} reduntant actions`);
    replay.actions = final;
    updateTxt();
}

function selectVal(select) {
    return select.options[select.selectedIndex].value;
}

const extensions = {
    replaybot: 'replay',
    replaybotf: 'replay',
    zbot: 'zbot',
    ybot: 'dat',
    ddhor: 'ddhor',
    'ddhor-new': 'ddhor',
    xbot: 'xbot',
    kdbot: 'kd',
    zbf: 'zbf',
    'xbot-frame': 'xbot',
    'ybot-frame': null, // why
    'url': 'replay',
    'url-f': 'replay',
    'rush': 'rsh',
	'mhrjson': 'json'
}

document.getElementById('select-from').addEventListener('change', e => {
    const input = document.getElementById('ipt-file');
    const val = selectVal(e.target);
    input.style.display = val === 'txt' ? 'none' : '';
    document.getElementById('textarea').disabled = val !== 'txt';
});

let replay;

function updateTxt() {
    document.getElementById('textarea').value = dumpTxt(replay);
}

document.getElementById('btn-convert').addEventListener('click', async () => {
    const from = selectVal(document.getElementById('select-from'));
    const to = selectVal(document.getElementById('select-to'));
    const files = document.getElementById('ipt-file').files;
    if (files.length || from === 'txt') {
        if (from === 'txt') {
            replay = parseTxt(document.getElementById('textarea').value);
        } else {
            console.log(files[0]);
            const data = await files[0].arrayBuffer();
            const view = new DataView(data);
            switch (from) {
                case 'replaybot':
                    replay = parseReplayBot(view);
                    break;
                case 'zbot':
                    replay = parsezBot(view);
                    break;
                case 'ybot':
                    replay = parseyBot(await files[0].text());
                    break;
                case 'ddhor':
                    replay = parseDDHOR(view);
                    break;
                case 'xbot':
                    replay = parsexBot(await files[0].text());
                    break;
                case 'kdbot':
                    replay = parseKDBot(view);
                    break;
                case 'zbf':
                    replay = parseZBF(view);
                    break;
                case 'xbot-frame':
                    replay = parsexBotFrame(await files[0].text());
                    break;
                case 'tasbot':
                case 'tasbot-f':
                    replay = parseTASBOT(await files[0].text(), from === 'tasbot-f');
                    break;
                case 'ybot-frame':
                    replay = parseYbotF(view);
                    break;
                case 'echo':
                case 'echof':
                    replay = parseEcho(await files[0].text(), from === 'echof');
                    break;
                case 'url':
                case 'url-f':
                    replay = parseUniversalReplayFormat(view, from === 'url-f');
                    break;
                case 'rush':
                    replay = parseRush(view);
                    break;
                case 'mhrjson':
                    replay = parseMHRjson(await files[0].text());
                    break;
            }
            if (to === 'txt') {
                // if converting to plain text then switch
                const selectFrom = document.getElementById('select-from');
                const selectTo = document.getElementById('select-to');
                let tmp = selectTo.selectedIndex;
                selectTo.selectedIndex = selectFrom.selectedIndex;
                selectFrom.selectedIndex = tmp;
                selectFrom.dispatchEvent(new Event('change'));
            }
        }
        console.log(replay);
        if (document.getElementById('chk-clean').checked) {
            cleanReplay(replay);
        }
        updateTxt();

        let buffer;
        switch (to) {
            case 'replaybot':
            case 'replaybotf':
                buffer = dumpReplayBot(replay, to === 'replaybotf');
                break;
            case 'zbot':
                buffer = dumpzBot(replay);
                break;
            case 'txt':
                return;
            case 'ybot':
                const text = dumpyBot(replay);
                saveAs(new Blob([text], {type: 'application/json'}), 'converted.' + extensions[to]);
                return;
            case 'ddhor':
                saveAs(new Blob([dumpDDHOR(replay)], {type: 'application/json'}), 'converted.ddhor');
                return;
            case 'xbot':
                saveAs(new Blob([dumpxBot(replay)], {type: 'text/plain'}), 'converted.' + extensions[to]);
                return;
            case 'kdbot':
                buffer = dumpKDBot(replay); 
                break;
            case 'zbf':
                buffer = dumpZBF(replay);
                break;
            case 'xbot-frame':
                saveAs(new Blob([dumpxBotFrame(replay)], {type: 'text/plain'}), 'converted.' + extensions[to]);
                return;
            case 'tasbot':
            case 'tasbot-f':
                saveAs(new Blob([dumpTASBOT(replay, to === 'tasbot-f')], {type: 'application/json'}), 'converted.json');
                return;
            case 'ybot-frame':
                buffer = dumpYbotF(replay);
                break;
            case 'echo':
            case 'echof':
                saveAs(new Blob([dumpEcho(replay, to === 'echof')], {type: 'application/json'}), 'converted.echo');
                return;
            case 'url':
            case 'url-f':
                buffer = dumpUniversalReplayFormat(replay, to === 'url-f');
                break;
            case 'rush':
                buffer = dumpRush(replay);
                break;
            case 'mhrjson':
                saveAs(new Blob([dumpMHRjson(replay)], {type: 'application/json'}), 'converted.mhr.json');
                return;
        }

        saveAs(new Blob([buffer], {type: 'application/octet-stream'}), extensions[to] ? 'converted.' + extensions[to] : 'converted');
    }
});

document.getElementById('btn-offset-frames').addEventListener('click', () => {
    const ipt = document.getElementById('ipt-offset-frames');
    let offset = parseInt(ipt.value);
    replay.actions.forEach(action => action.x += offset);
    updateTxt();
    ipt.value = 0;
});

document.getElementById('btn-remove-p1').addEventListener('click', () => {
    replay.actions = replay.actions.filter(action => action.player2);
    updateTxt();
});

document.getElementById('btn-remove-p2').addEventListener('click', () => {
    replay.actions = replay.actions.filter(action => !action.player2);
    updateTxt();
});

document.getElementById('btn-flip-hold').addEventListener('click', () => {
    replay.actions.forEach(action => action.hold = !action.hold);
    updateTxt();
});

document.getElementById('btn-flip-player').addEventListener('click', () => {
    replay.actions.forEach(action => action.player2 = !action.player2);
    updateTxt();
});

document.getElementById('btn-sort-inputs').addEventListener('click', () => {
    replay.actions.sort((a, b) => {
        // ONLY sort by frame. Not sorting by frame could lead to following situation
        return (a.x - b.x);
    });
    updateTxt();
});
