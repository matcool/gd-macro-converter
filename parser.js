//@ts-check

const MacroType = {
	PLAINTEXT: -1,
	REPLAYBOT: 0,
	ZBOT: 1,
	XBOT: 2,
	YBOT: 3,
	DDHOR: 4,
	KDBOT: 5,
	UNIVERSAL: 6,
	RUSH: 7,
	ECHO: 8,
	TASBOT: 9
};

Object.freeze(MacroType);

// tfw no Interface
/** @typedef {{n: number, hold: boolean, player2: boolean}} Action */

class Macro {
	constructor() {
		/** @type {number} */
		this.fps = 0;
		/** @type {Action[]} */
		this.actions = [];
		/** @type {object} */
		this.extraData = {};
		/** @type {number} */
		this.type = MacroType.PLAINTEXT;
		/** @type {boolean} */
		this.frame = false;
	}
};


class Stream {
	/**
	 * @param {ArrayBuffer} buffer
	 */
	constructor(buffer) {
		this.buffer = buffer;
		this.view = new DataView(this.buffer);
		this.pos = 0;
		this.length = buffer.byteLength;
	}
	/** @param {number} n */
	seek(n) { this.pos = n; }
	readU32() { return this.view.getUint32((this.pos += 4, this.pos - 4), true); }
	readU16() { return this.view.getUint16((this.pos += 2, this.pos - 2), true); }
	readF32() { return this.view.getFloat32((this.pos += 4, this.pos - 4), true); }
	readU8() { return this.view.getUint8(this.pos++); }
	/** @param {number} length */
	readStr(length) {
		this.pos += length;
		return new TextDecoder().decode(new Uint8Array(this.view.buffer.slice(this.pos - length, this.pos)));
	}
	toText() {
		return new TextDecoder().decode(new Uint8Array(this.view.buffer));
	}
	eof() { return this.pos >= this.length; }
};

const Converter = {
	/** @type { {[x: number]: (macro: Macro, stream: Stream) => void;} } */
	decoders: {
		[MacroType.REPLAYBOT](macro, stream) {
			const magic = stream.readStr(4);
			if (magic === 'RPLY') {
				const version = stream.readU8();
				macro.extraData.version = version;
				if (version === 1 || version === 2) {
					if (version === 2)
						macro.frame = stream.readU8() === 1;
					macro.fps = stream.readF32();
					while (!stream.eof()) {
						const n = macro.frame ? stream.readU32() : stream.readF32();
						const state = stream.readU8();
						macro.actions.push({
							n,
							hold: !!(state & 1),
							player2: !!(state >> 1)
						});
					}
				} else
					throw `Tried decoding ReplayBot macro with unsupported version ${version}`;
			} else {
				stream.seek(0);
				macro.fps = stream.readF32();
				macro.frame = false;
				while (!stream.eof()) {
					macro.actions.push({
						n: stream.readF32(),
						hold: !!stream.readU8(),
						player2: !!stream.readU8()
					});
				}
			}
		},

		[MacroType.ZBOT](macro, stream) {
			const delta = stream.readF32();
			const speedhack = stream.readF32();
			macro.fps = 1 / delta / speedhack;
			while (!stream.eof()) {
				macro.actions.push({
					n: macro.frame ? stream.readU32() : stream.readF32(),
					hold: stream.readU8() === 0x31,
					player2: stream.readU8() !== 0x31 // flipped cuz zbot stores it as player1
				});
			}
		},

		[MacroType.XBOT](macro, stream) {
			const text = stream.toText();
			const lines = text.split('\n').map(s => s.trim()).filter(s => s);
			const popLeft = arr => arr.splice(0, 1)[0];
			macro.fps = parseInt(popLeft(lines).split(' ')[1]);

			const header = popLeft(lines);
			macro.frame = false;
			if (header === 'frames')
				macro.frame = true;
			else if (header !== 'pro_plus')
				throw 'xBot macro is not pro+';

			// for casting the int to float (andx is weird)
			const view = new DataView(new ArrayBuffer(4));
			for (const line of lines) {
				const [state, rawPos] = line.split(' ').map(s => parseInt(s));
				if (!macro.frame) view.setUint32(0, rawPos);
				macro.actions.push({
					n: macro.frame ? rawPos : view.getFloat32(0),
					hold: !!(state & 1),
					player2: !!(state >> 1)
				})
			}
		},

		[MacroType.DDHOR](macro, stream) {
			macro.frame = false;
			const magic = stream.readStr(4);
			if (magic === 'DDHR') {
				macro.fps = stream.readU16();
				const p1 = stream.readU32();
				const p2 = stream.readU32();
				let i = 0;
				while (!stream.eof()) {
					macro.actions.push({
						n: stream.readF32(),
						hold: stream.readU8() === 0,
						player2: i >= p1
					});
					++i;
				}
			} else {
				stream.seek(0);
				const data = JSON.parse(stream.toText());
				macro.fps = data.fps;
				if (data.macro === 'x-position') {
					macro.actions = [
						...data.inputsP1.map(ipt => ({
							n: ipt.position,
							hold: ipt.action === 'PUSH',
							player2: false
						})),
						...data.inputsP2.map(ipt => ({
							n: ipt.position,
							hold: ipt.action === 'PUSH',
							player2: true
						}))
					];
				}
			}
			// Lol
			macro.actions.sort((a, b) => a.n - b.n);
		},

		[MacroType.KDBOT](macro, stream) {
			macro.frame = true;
			macro.fps = stream.readF32();
			while (!stream.eof()) {
				macro.actions.push({
					n: stream.readU32(),
					hold: !!stream.readU8(),
					player2: !!stream.readU8()
				});
			}
		},

		[MacroType.TASBOT](macro, stream) {
			const data = JSON.parse(stream.toText());
			macro.fps = data.fps;
			for (const action of data.macro) {
				const n = macro.frame ? action.frame : action.player_1.x_position;
				let state;
				if (state = action.player_1.click ?? action.player_1_click)
					macro.actions.push({ n, hold: state === 1, player2: false });
				if (state = action.player_2.click ?? action.player_2_click)
					macro.actions.push({ n, hold: state === 1, player2: true });
			}
		},

		[MacroType.ECHO](macro, stream) {
			const data = JSON.parse(stream.toText());
			macro.fps = data.FPS;
			const start = data['Starting Frame'];
			// TODO: store both x and frame
			macro.actions = data['Echo Replay'].map(action => ({
				n: macro.frame ? action['Frame'] + start : action['X Position'],
				hold: action['Hold'],
				player2: action['Player 2']
			}));
		},
	},
	/**
	 * @param {Macro} macro
	 * @param {Stream} stream
	 */
	decode(macro, stream) {
		this.decoders[macro.type](macro, stream);
	}
};

Object.freeze(Converter);