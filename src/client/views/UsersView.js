import size from 'lodash/size';
import values from 'lodash/values';
import View from '../lib/View';

export default class UsersView extends View {
	constructor(changes) {
		super(changes, ['users', 'show_votes']);
	}

	_render() {
		if(this._data.users) {
			const users = values(this._data.users).filter(user => user.is_voter);
			const num = size(users);

			return ['ul', {class: num ? 'players' : 'players hidden'},
				users.map((u,i) => {
					let angle = (i/num + 1/(num*2)) * Math.PI;
					let left = 50 + Math.cos(angle)*50;
					let top = (1 - Math.sin(angle))*100;
					let vote = u.vote === undefined ? '' : u.vote;
					return ['li',
						{
							class: 'player',
							style: `
								left: ${left}%;
								top: ${top}%;
								transform: translate(${-left}%, ${-top}%);
							`
						},
						['span', `${u.name}: `],
						vote.length ? [
							'span', {
								class: this._data.show_votes ? 'vote' : 'hidden vote'
							},
							`${vote}`
						] : []
					];
				})
			];
		}
		return ['ul'];
	}
}
