function parseTxt(text) {
    const lines = text.split('\n');
    const fps = parseFloat(lines.splice(0, 1));
    const actions = [];
    for (const line of lines) {
        const split = line.split(' ');
        if (split.length !== 3) continue;
        actions.push({
            x: parseFloat(split[0]),
            hold: split[1] === '1',
            player2: split[2] === '1'
        });
    }
    return {fps, actions};
}

function parseReplayBot(view) {
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

/**
 * i just want vscode completions
 * @param {DataView} view 
 */
function parseDDHOR(view) {
    let _tmp = new Uint8Array(view.buffer.slice(0, 4));
    let magic = String.fromCharCode.apply(String, _tmp);
    console.log(magic);
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
    }
}

function dumpTxt(replay) {
    let final = '';
    final += `${replay.fps}\n`;
    for (let action of replay.actions) {
        final += `${action.x} ${+action.hold} ${+action.player2}\n`
    }
    return final.slice(0, final.length-1);
}

function dumpReplayBot(replay) {
    const buffer = new ArrayBuffer(4 + replay.actions.length * 6);
    const view = new DataView(buffer);
    view.setFloat32(0, replay.fps, true);
    replay.actions.forEach((action, i) => {
        view.setFloat32(4 + i * 6, action.x, true);
        view.setUint8(8 + i * 6, +action.hold);
        view.setUint8(9 + i * 6, +action.player2);
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
        view.setUint8(13 + i * 6, action.player2 ? 0x31 : 0x30);
    });
    return buffer;
}

function dumpyBot(replay) {
    return JSON.stringify({
        converted: {
            delta_override: 1 / replay.fps,
            instructions: replay.actions.map(action => {
                return {
                    x: action.x,
                    press: action.hold,
                    p2: action.player2
                };
            })
        }
    });
}

function strToBuf(str) {
    return new Uint8Array(str.split('').map(i => i.charCodeAt()));
}

function dumpDDHOR(replay) {
    const buffer = new ArrayBuffer(14 + replay.actions.length * 5);
    const view = new DataView(buffer);
    // amazing
    strToBuf('DDHR').forEach((n, i) => view.setUint8(i, n));
    view.setInt16(4, replay.fps, true);
    // amazing
    const player1Actions = replay.actions.filter(i => !i.player2);
    const player2Actions = replay.actions.filter(i => i.player2);
    view.setInt32(6, player1Actions.length, true);
    view.setInt32(10, player2Actions.length, true);
    // amazing
    [...player1Actions, ...player2Actions].forEach((action, i) => {
        view.setFloat32(14 + i * 5, action.x, true);
        view.setUint8(18 + i * 5, +!action.hold);
    });
    return buffer;
}

function selectVal(select) {
    return select.options[select.selectedIndex].value;
}

const extensions = {
    replaybot: 'replay',
    zbot: 'zbot',
    ybot: 'dat',
    ddhor: 'ddhor'
}

document.getElementById('select-from').addEventListener('change', e => {
    const input = document.getElementById('ipt-file');
    input.style.display = selectVal(e.target) === 'txt' ? 'none' : '';
});

document.getElementById('btn-convert').addEventListener('click', async () => {
    const from = selectVal(document.getElementById('select-from'));
    const to = selectVal(document.getElementById('select-to'));
    const files = document.getElementById('ipt-file').files;
    if (files.length || from === 'txt') {
        let replay;
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
            }

        }
        console.log(replay);
        document.getElementById('textarea').value = dumpTxt(replay);

        let buffer;
        switch (to) {
            case 'replaybot':
                buffer = dumpReplayBot(replay);
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
                buffer = dumpDDHOR(replay);
                break;
        }

        saveAs(new Blob([buffer], {type: 'application/octet-stream'}), 'converted.' + extensions[to]);
    }
});