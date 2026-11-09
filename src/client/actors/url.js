import isString from 'lodash/isString';
import event$ from '../lib/event$';
import Kefir from 'kefir';

export default changes => {
	event$(changes, 'room')
		.filter(isString)
		.filter(room => room !== location.pathname.substr(1))
		.onValue(room => history.pushState(room, room ? room : 'lobby', `/${room}`));

	return Kefir.merge([
		Kefir.fromEvents(window, 'popstate', e => e.state), // emit room when user changes history position
		changes.map(() => 1).skipDuplicates().map(() => location.pathname.substr(1)) // emit room on initial state
	]).map(room => ({'submit:room':room}));
};
