// import lodash functions
import isNull from 'lodash/isNull';
import isString from 'lodash/isString';
import mapValues from 'lodash/mapValues';
import set from 'lodash/set';

// import Kefir
import Kefir from 'kefir';

// import actors
import dom from './actors/dom';
import firebase from './actors/firebase';
import storage from './actors/storage';
import url from './actors/url';

// import libs
import arrayFlatMap from './lib/arrayFlatMap';
import event$ from './lib/event$';

// The App Conductor. Responsible for mapping events to state changes.
export default data => {
	// create a logging function
	const observer = (name, color) => data.env === 'development' ? {
		value: v => console.log(`%c${name}: ${JSON.stringify(v)}`,`background:${color}`),
		error: console.error
	} : {};

	// create the input/output pools
	const events = Kefir.pool();
	const changes = Kefir.pool();

	// a shared change pool was a bad idea.
	const firebaseChanges = Kefir.pool();

	// activate (and log) the pools
	events.observe(observer('e','#fef'));
	changes.observe(observer('c','#eff'));
	firebaseChanges.observe(observer('f','#cff'));

	// confirm my changes to topic happen before reading new value
	const pending$ = Kefir.merge([
		event$(events, 'set:topic').filter(isString).map(() => 1),
		event$(events, 'report:topic').filter(isString).map(() => -1)
	]);
	const nonePending$ = pending$.scan((a,b) => Math.max(a + b, 0), 0).map(pending => pending === 0);
	const negPending$ = pending$.scan((a,b) => a + b, 0).map(pending => pending < 0);
	changes.plug(event$(events, 'change:topic').filterBy(nonePending$).map(topic => ({topic})));
	changes.plug(event$(events, 'report:topic').filterBy(negPending$).map(topic => ({topic})));

	// simple change event to state change passthrough
	changes.plug(arrayFlatMap(
		['name', 'show_votes', 'users', 'vote'],
		key => event$(events, `change:${key}`).map(val => ({[key]:val}))
	));
	firebaseChanges.plug(event$(events, 'change:name').map(name => ({name})));

	// simple set event to state change passthrough
	firebaseChanges.plug(arrayFlatMap(
		['name', 'topic', 'vote'],
		key => event$(events, `set:${key}`).map(val => ({[key]:val}))
	));
	changes.plug(event$(events, 'set:name').map(name => ({name})));

	// set room on submit
	changes.plug(event$(events, 'submit:room').skipDuplicates().map(room => ({room})));
	firebaseChanges.plug(event$(events, 'submit:room').skipDuplicates().map(room => ({room})));

	// set deck
	changes.plug(event$(events, 'change:votes').filter().map(votes => ({votes})));
	firebaseChanges.plug(event$(events, 'change:votes').filter(isNull).map(() => ({votes: data.defaultVotes})));

	// reset action
	firebaseChanges.plug(
		event$(events, 'change:users')
		.sampledBy(event$(events, 'click:reset'))
		.filter()
		.map(users => mapValues(users, user => set(user, 'vote', '')))
		.map(users => ({ show_votes: false, topic: '', users }))
	);

	// reveal action
	firebaseChanges.plug(Kefir.constant({show_votes: true}).sampledBy(event$(events, 'click:reveal')));

	// connect firebase actor
	events.plug(firebase(firebaseChanges));

	// connect other actors
	events.plug(
		arrayFlatMap(
			[dom, storage, url],
			actor => actor(changes)
		)
	);

	// initial state
	const init$ = Kefir.constant({ firebase: data.firebase });
	changes.plug(init$);
	firebaseChanges.plug(init$);
};
