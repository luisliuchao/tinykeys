type KeyBindingPress = [string[], string]

/**
 * A map of keybinding strings to event handlers.
 */
export interface KeyBindingMap {
	[keybinding: string]: (event: KeyboardEvent) => void
}

/**
 * These are the modifier keys that change the meaning of keybindings.
 *
 * Note: Ignoring "AltGraph" because it is covered by the others.
 */
let KEYBINDING_MODIFIER_KEYS = ["Shift", "Meta", "Alt", "Control"]

/**
 * Keybinding sequences should timeout if individual key presses are more than
 * 1s apart.
 */
let TIMEOUT = 1000

/**
 * An alias for creating platform-specific keybinding aliases.
 */
let MOD =
	typeof navigator === "object" &&
	/Mac|iPod|iPhone|iPad/.test(navigator.platform)
		? "Meta"
		: "Control"

/**
 * Parses a "Key Binding String" into its parts
 *
 * grammar    = `<sequence>`
 * <sequence> = `<press> <press> <press> ...`
 * <press>    = `<key>` or `<mods>+<key>`
 * <mods>     = `<mod>+<mod>+...`
 */
function parse(str: string): KeyBindingPress[] {
	return str
		.trim()
		.split(" ")
		.map(press => {
			let mods = press.split("+")
			let key = mods.pop() as string
			mods = mods.map(mod => (mod === "$mod" ? MOD : mod))
			return [mods, key]
		})
}

/**
 * This tells us if a series of events matches a key binding sequence either
 * partially or exactly.
 */
function match(event: KeyboardEvent, press: KeyBindingPress): boolean {
	// prettier-ignore
	return !(
		// Allow either the `event.key` or the `event.code`
		// MDN event.key: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key
		// MDN event.code: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
		(
			(press[1] && press[1].toUpperCase()) !== (event.key && event.key.toUpperCase()) &&
			press[1] !== event.code
		) ||

		// Ensure all the modifiers in the keybinding are pressed.
		press[0].find(mod => {
			return !event.getModifierState(mod)
		}) ||

		// KEYBINDING_MODIFIER_KEYS (Shift/Control/etc) change the meaning of a
		// keybinding. So if they are pressed but aren't part of the current
		// keybinding press, then we don't have a match.
		KEYBINDING_MODIFIER_KEYS.find(mod => {
			return !press[0].includes(mod) && press[1] !== mod && event.getModifierState(mod)
		})
	)
}

/**
 * Subscribes to keybindings.
 *
 * Returns an unsubscribe method.
 *
 * @example
 * ```js
 * import keybindings from "../src/keybindings"
 *
 * keybindings(window, {
 * 	"Shift+d": () => {
 * 		alert("The 'Shift' and 'd' keys were pressed at the same time")
 * 	},
 * 	"y e e t": () => {
 * 		alert("The keys 'y', 'e', 'e', and 't' were pressed in order")
 * 	},
 * 	"$mod+d": () => {
 * 		alert("Either 'Control+d' or 'Meta+d' were pressed")
 * 	},
 * })
 * ```
 */
export default function keybindings(
	target: Window | HTMLElement,
	keyBindingMap: KeyBindingMap,
): () => void {
	let keyBindings = Object.keys(keyBindingMap).map(key => {
		return [parse(key), keyBindingMap[key]] as const
	})

	let possibleMatches = new Map<KeyBindingPress[], KeyBindingPress[]>()
	let timer: NodeJS.Timeout | null = null

	let onKeyDown: EventListener = event => {
		// Ensure and stop any event that isn't a full keyboard event.
		// Autocomplete option navigation and selection would fire a instanceof Event,
		// instead of the expected KeyboardEvent
		if (!(event instanceof KeyboardEvent)) {
			return
		}

		keyBindings.forEach(keyBinding => {
			let sequence = keyBinding[0]
			let callback = keyBinding[1]

			let prev = possibleMatches.get(sequence)
			let remainingExpectedPresses = prev ? prev : sequence
			let currentExpectedPress = remainingExpectedPresses[0]

			let matches = match(event, currentExpectedPress)

			if (!matches) {
				// Modifier keydown events shouldn't break sequences
				// Note: This works because:
				// - non-modifiers will always return false
				// - if the current keypress is a modifier then it will return true when we check its state
				// MDN: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/getModifierState
				if (!event.getModifierState(event.key)) {
					possibleMatches.delete(sequence)
				}
			} else if (remainingExpectedPresses.length > 1) {
				possibleMatches.set(sequence, remainingExpectedPresses.slice(1))
			} else {
				possibleMatches.delete(sequence)
				callback(event)
			}
		})

		if (timer) {
			clearTimeout(timer)
		}

		timer = setTimeout(possibleMatches.clear.bind(possibleMatches), TIMEOUT)
	}

	target.addEventListener("keydown", onKeyDown)

	return () => {
		target.removeEventListener("keydown", onKeyDown)
	}
}
