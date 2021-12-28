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
				addReactiveHandler(child.attributes['show-if'].value, (value) => { child.hidden = !value; });
			}
			goThroughChildren(child);
		}
	}
}
goThroughChildren(document.body);

reactiveValues.dragAreaMessage = 'Drag in your file';

/**
 * @param {string} selector
 * @returns {HTMLElement}
 */
function select(selector) {
	return document.querySelector(selector);
}
/**
 * @param {any} selector
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

function nameForEnum(e, value) {
	for (const [k, v] of Object.entries(e))
		if (v === value) return k;
}

let macro = new Macro();

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
		const _split = file.name.split('.');
		const ext = _split.length === 1 ? '' : last(_split);
		macro = new Macro();
		if (ext === 'zbf' || ext === 'zbot') {
			macro.type = MacroType.ZBOT;
			macro.frame = ext === 'zbf';
		} else if (ext === 'replay') {
			macro.type = MacroType.REPLAYBOT;
		} else if (ext === 'echo') {
			macro.type = MacroType.ECHO;
		} else if (ext === 'ddhor') {
			macro.type = MacroType.DDHOR;
		}
		reactiveValues.macroType = nameForEnum(MacroType, macro.type);
		const buffer = await file.arrayBuffer();
		// TODO: let user select
		const stream = new Stream(buffer);
		Converter.decode(macro, stream);
	});
}