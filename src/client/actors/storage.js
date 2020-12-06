import isBoolean from 'lodash/isBoolean';
import isString from 'lodash/isString';
import ls from 'local-storage';
import Kefir from 'kefir';
import event$ from '../lib/event$';

// return value changes at [key] that pass filter()
const valChange$ = (changes, key, filter) => event$(changes, key)
	.filter(filter)
	.skipDuplicates();

// store changes to [key] at pk/key
const store$ = (changes, key, filter) => valChange$(changes, key, filter)
	.onValue(val => ls(`pk/${key}`, val));

// emit [key] upon change
const read$ = (stream, key) => stream
	.map(() => ls(`pk/${key}`));

export default changes => {
	// store changes
	store$(changes, 'name', isString);
	store$(changes, 'is_voter', isBoolean);
	store$(changes, 'is_editor', isBoolean);

	// read stored values when room changes
	const roomChange$ = valChange$(changes, 'room');
	return Kefir.merge([
		read$(roomChange$, 'name').map(v => ({'change:name': v})),
		// default is_voter to true if it is not defined
		read$(roomChange$, 'is_voter').map(v => isBoolean(v) ? v : true).map(v => ({'change:is_voter': v})),
		// default is_editor to false if it is not defined
		read$(roomChange$, 'is_editor').map(v => isBoolean(v) ? v : false).map(v => ({'change:is_editor': v})),
	]);
};
