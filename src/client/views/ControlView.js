import Kefir from 'kefir';
import View from '../lib/View';
import IconButtonView from './IconButtonView';
import TextInputView from './TextInputView';

export default class ControlView extends View {
	constructor(changes) {
		super(changes, ['is_editor', 'topic']);
		this.issueInput = new TextInputView(changes, { name: 'topic' });
		this.resetButton = new IconButtonView(changes, { name: 'refresh', className: 'reset' });
		this.revealButton = new IconButtonView(changes, { name: 'eye', className: 'reveal' });
		this.events = Kefir.merge([
			this.issueInput.events,
			this.resetButton.events.map(() => ({'click:reset': true})),
			this.revealButton.events.map(() => ({'click:reveal': true}))
		]);
	}

	_render() {
		return ['div', {class:'control'},
			['div', {class: this._data.is_editor ? 'only-topic hidden' : 'only-topic'}, this._data.topic || ''],
			['div', {class: this._data.is_editor ? 'editor' : 'editor hidden'},
				[this.issueInput.component],
				['div', {class:'buttons'},
					[this.resetButton.component],
					[this.revealButton.component]
				]
			]
		];
	}
}
