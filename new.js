
/**
 * @param {HTMLElement} element
 * @param {number} index
 * @param {Node} child
 */
function insertChildAtIndex(element, index, child) {
	if (index >= element.childNodes.length)
		element.appendChild(child);
	else
		element.insertBefore(child, element.childNodes[index]);
}

/**
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
 function select(selector) {
	return document.querySelector(selector);
}
/**
 * @param {string} selector
 * @returns {NodeListOf<HTMLElement>}
 */
function selectAll(selector) {
	return document.querySelectorAll(selector);
}

/**
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
function last(arr) {
	return arr[arr.length - 1];
}

/**
 * @param {string} fileName
 * @returns {string | null}
 */
function fileExt(fileName) {
	const p = fileName.split('.');
	return p.length === 1 ? null : last(p);
}

/**
 * @template V
 * @param {{[key: string]: V}} e
 * @param {V} value
 * @returns {string | undefined}
 */
function nameForEnum(e, value) {
	for (const [k, v] of Object.entries(e))
		if (v === value) return k;
}

/**
 * @typedef {(value: any) => void} ReactiveHandler
 */

/** @type {Map.<string | symbol, ReactiveHandler[]>} */
const reactiveHandlers = new Map();
/** @type {Object.<string | symbol, any>} */
const ctx = new Proxy({}, {
	get(target, prop, _) {
		return target[prop];
	},
	set(target, prop, value, _) {
		target[prop] = value;
		console.log(`[info] setting reactive ${prop.toString()} with value ${value}`);
		if (reactiveHandlers.has(prop))
			// @ts-ignore
			for (const cb of reactiveHandlers.get(prop))
				cb(value);
		return true;
	}
});

/**
 * @param {string | symbol} prop
 * @param {ReactiveHandler} handler
 */
function addReactiveHandler(prop, handler) {
	if (!reactiveHandlers.has(prop))
		reactiveHandlers.set(prop, []);
	// @ts-ignore
	reactiveHandlers.get(prop).push(handler);
}

/**
 * @param {HTMLElement} element
 */
function goThroughChildren(element) {
	const r = /{{(.+?)}}/;
	for (let i = 0; i < element.childNodes.length; ++i) {
		const child = element.childNodes[i];
		if (child.nodeType === Node.TEXT_NODE) {
			// @ts-ignore
			const match = child.nodeValue.match(r);
			if (match) {
				const node = document.createTextNode(match[0]);
				addReactiveHandler(match[1], value => {
					node.nodeValue = value;
				})
				const rest = child.nodeValue.substring(match.index + match[0].length);
				child.nodeValue = child.nodeValue.substring(0, match.index);
				++i;
				insertChildAtIndex(element, i, node);
				if (rest)
					insertChildAtIndex(element, i + 1, document.createTextNode(rest));
			}
		} else if (child instanceof HTMLElement) {
			if (child.attributes['show-if']) {
				child.hidden = true;
				/** @type {string} */
				let propName = child.attributes['show-if'].value;
				let flip = false;
				if (propName[0] === '!') {
					flip = true;
					propName = propName.substring(1);
					console.log(`adding inverted handler for ${propName}`);
				}
				addReactiveHandler(propName, (value) => { child.hidden = !!(+!value ^ +flip); });
			}
			goThroughChildren(child);
		}
	}
}
goThroughChildren(document.body);

ctx.dragAreaMessage = 'Drag in your file';

const Bots = {
	list: 'Plain Text,ReplayBot,zBot,zBot Frame,yBot,xBot,TASBOT,Echo,Rush,Universal Replay,DDHOR,MH Replay'.split(','),
	/**
	 * @param {Macro} macro
	 * @returns {number}
	 */
	indexFor(macro) {
		// TODO: rewrite this
		switch (macro.type) {
			case MacroType.REPLAYBOT:
				return 1;
			case MacroType.ZBOT:
				return macro.frame ? 3 : 2;
			case MacroType.YBOT:
				return 4;
			case MacroType.XBOT:
				return 5;
			case MacroType.TASBOT:
				return 6;
			case MacroType.ECHO:
				return 7;
			case MacroType.RUSH:
				return 8;
			case MacroType.UNIVERSAL:
				return 9;
			case MacroType.DDHOR:
				return 10;
			case MacroType.MHREPLAY:
				return 11;
		}
	},
	/**
	 * @param {Macro} macro
	 * @param {number} index
	 */
	setTypeForIndex(macro, index) {
		switch (index) {
			case 0:
				macro.type = MacroType.PLAINTEXT;
				break;
			case 1:
				macro.type = MacroType.REPLAYBOT;
				break;
			case 2:
			case 3:
				macro.type = MacroType.ZBOT;
				macro.frame = index === 3;
				break;
			case 4:
				macro.type = MacroType.YBOT;
				break;
			case 5:
				macro.type = MacroType.XBOT;
				break;
			case 6:
				macro.type = MacroType.TASBOT;
				break;
			case 7:
				macro.type = MacroType.ECHO;
				break;
			case 8:
				macro.type = MacroType.RUSH;
				break;
			case 9:
				macro.type = MacroType.UNIVERSAL;
				break;
			case 10:
				macro.type = MacroType.DDHOR;
				break;
			case 11:
				macro.type = MacroType.MHREPLAY;
				break;
		}
	}

};

Object.freeze(Bots);

selectAll('bot-select').forEach(element => {
	const select = document.createElement('select');
	select.id = element.id;
	for (let name of Bots.list) {
		const option = document.createElement('option');
		option.textContent = name;
		select.appendChild(option);
	}
	element.parentElement.replaceChild(select, element);
});

let macro = new Macro();
/** @type {{ name: string, stream: Stream }} */
let currentFile;

{
	const dragArea = select('#drag-area');

	dragArea.addEventListener('dragenter', event => {
		dragArea.style['background-color'] = '#222';
	});

	dragArea.addEventListener('dragleave', event => {
		dragArea.style['background-color'] = '#333';
	});

	dragArea.addEventListener('dragover', event => {
		event.preventDefault();
	});

	dragArea.addEventListener('drop', async event => {
		dragArea.style['background-color'] = '#333';
		ctx.dragAreaMessage = 'Processing files';
		event.preventDefault();

		if (event.dataTransfer.files.length === 0)
			return;

		const file = event.dataTransfer.files[0];

		ctx.hasMacro = true;
		ctx.fileName = file.name;

		macro = new Macro();

		const stream = new Stream(await file.arrayBuffer());
		currentFile = {
			name: file.name,
			stream: stream
		};

		Converter.guessType(macro, file.name, fileExt(file.name), stream);
		stream.seek(0);

		if (macro.type === MacroType.PLAINTEXT)
			ctx.guessFailed = true;
		else {
			ctx.guessFailed = false;
			ctx.macroType = nameForEnum(MacroType, macro.type);
			ctx.macroFrame = macro.frame;
			ctx.macroFPS = macro.fps ? macro.fps : 'Unknown';
			// @ts-ignore
			select('#select-from').selectedIndex = Bots.indexFor(macro);
		}
	});
}

select('#convert-button').addEventListener('click', _ => {
	Bots.setTypeForIndex(macro, select('#select-from').selectedIndex);
	Converter.decode(macro, currentFile.stream);

	let dummy = new Macro();
	Bots.setTypeForIndex(dummy, select('#select-to').selectedIndex);

	const result = Converter.encoders[dummy.type](macro);

	const ext = fileExt(currentFile.name);
	const fileName = (ext ? currentFile.name.slice(0, currentFile.name.length - ext.length - 1) : currentFile.name) + '.txt';
	console.log(fileName);
	if (result instanceof Stream) {
		// @ts-ignore
		saveAs(new Blob([result.buffer], { type: 'application/octet-stream' }), fileName);
	} else {
		saveAs(new Blob([result], { type: 'application/json' }), fileName);
	}
});