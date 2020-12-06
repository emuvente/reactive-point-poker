import w from 'window';
import Kefir from 'kefir';
import View from '../lib/View';
import TextInputView from './TextInputView';
import ToggleView from './ToggleView';

export default class NameView extends View {
	constructor(changes) {
		super(changes, ['room'], s=>s, Kefir.pool());

		this.nameView = new TextInputView(changes, {
			name: 'name',
			className: 'user',
			placeholder: 'name',
		});
		this.events.plug(this.nameView.events);

		this.roomView = new TextInputView(changes, {
			name: 'room',
		});
		this.events.plug(this.roomView.events);

		this.voterView = new ToggleView(changes, {
			name: 'is_voter',
			className: 'role',
			value: 'voter',
		});
		this.events.plug(this.voterView.events);

		this.editorView = new ToggleView(changes, {
			name: 'is_editor',
			className: 'role',
			value: 'editor',
		});
		this.events.plug(this.editorView.events);
	}

	_render() {
		return ['div', {class: 'where'},
			[this.nameView.component],
			['span', '@'],
			['span', w.location.hostname],
			['span', '/'],
			[this.roomView.component],
			['div', {class: 'roles'},
				[this.voterView.component],
				[this.editorView.component]
			]
		];
	}
}
