//@ts-check

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
 * @returns {HTMLElement}
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
 * @returns {string}
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
const reactiveValues = new Proxy({}, {
	get(target, prop, _) {
		return target[prop];
	},
	set(target, prop, value, _) {
		target[prop] = value;
		console.log(`[info] setting reactive ${prop.toString()} with value ${value}`);
		if (reactiveHandlers.has(prop))
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

reactiveValues.dragAreaMessage = 'Drag in your file';

const Bots = {
	list: 'Plain Text,ReplayBot,zBot,zBot Frame,yBot,xBot,TASBOT,Echo,Rush,Universal Replay,DDHOR'.split(','),
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
		reactiveValues.dragAreaMessage = 'Processing files';
		event.preventDefault();

		if (event.dataTransfer.files.length === 0)
			return;

		const file = event.dataTransfer.files[0];

		reactiveValues.hasMacro = true;
		reactiveValues.fileName = file.name;

		macro = new Macro();

		const stream = new Stream(await file.arrayBuffer());
		currentFile = {
			name: file.name,
			stream: stream
		};

		Converter.guessType(macro, fileExt(file.name), stream);
		stream.seek(0);

		if (macro.type === MacroType.PLAINTEXT)
			reactiveValues.guessFailed = true;
		else {
			reactiveValues.guessFailed = false;
			reactiveValues.macroType = nameForEnum(MacroType, macro.type);
			reactiveValues.macroFrame = macro.frame;
			reactiveValues.macroFPS = macro.fps ? macro.fps : 'Unknown';
			// @ts-ignore		
			select('#select-from').selectedIndex = Bots.indexFor(macro);
		}
	});
}

select('#convert-button').addEventListener('click', _ => {
	Converter.decode(macro, currentFile.stream);
	// Oops this should not be macro.type
	const result = Converter.encoders[macro.type](macro);
	const ext = fileExt(currentFile.name);
	const fileName = (ext ? currentFile.name.slice(0, currentFile.name.length - ext.length - 1) : currentFile.name) + '.txt';
	console.log(fileName);
	if (result instanceof Stream) {
		// @ts-ignore
		saveAs(new Blob([result.buffer], { type: 'application/octet-stream' }), fileName);
	} else {

	}
});