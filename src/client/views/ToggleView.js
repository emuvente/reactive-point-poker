import View from '../lib/View';

export default class ToggleView extends View {
	constructor(changes, { name, element = 'div', className, id, value }) {
		super(changes, [name]);
		this.name = name;
		this.element = element;
		this.className = className || name;
		this.id = id || name;
		this.value = value;
	}

	_render() {
		const current = this._data[this.name];
		const isBoolean = typeof current === 'boolean';
		return [this.element, {class: `toggle-input ${this.className}`},
			['input', {
				id: this.id,
				type: 'checkbox',
				name: this.name,
				value: this.value,
				checked: isBoolean ? current : current === this.value,
				onchange: e => this._emit({[`change:${this.name}`]: e.target.checked})
			}],
			['label', {
				for: this.id
			}, this.value]
		];
	}
}
