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

	// activate (and log) the pools
	events.observe(observer('i','#fef'));
	changes.observe(observer('o','#eff'));

	// try to filter out duplicate topic events
	let filters = [];
	event$(events, 'set:topic').filter(isString).observe(v => filters.push(v));
	const topic$ = event$(events, 'change:topic').filter(isString);
	changes.plug(topic$.filter(v => filters.indexOf(v) < 0).map(val => ({topic:val})));
	topic$.filter(v => filters.indexOf(v) > -1).map(v => filters.indexOf(v)).observe(i => filters.splice(i,1));

	// simple change event to state change passthrough
	changes.plug(arrayFlatMap(
		['name', 'show_votes', 'users', 'vote'],
		key => event$(events, `change:${key}`).map(val => ({[key]:val}))
	));

	// simple set event to state change passthrough
	changes.plug(arrayFlatMap(
		['name', 'topic', 'vote'],
		key => event$(events, `set:${key}`).map(val => ({[key]:val}))
	));

	// set room on submit
	changes.plug(event$(events, 'submit:room').skipDuplicates().map(room => ({room})));

	// set deck
	changes.plug(event$(events, 'change:votes').filter().map(votes => ({votes})));
	changes.plug(event$(events, 'change:votes').filter(isNull).map(() => ({votes: data.defaultVotes})));

	// reset action
	changes.plug(
		event$(events, 'change:users')
		.sampledBy(event$(events, 'click:reset'))
		.filter()
		.map(users => mapValues(users, user => set(user, 'vote', '')))
		.map(users => ({ show_votes: false, topic: '', users }))
	);

	// reveal action
	changes.plug(Kefir.constant({show_votes: true}).sampledBy(event$(events, 'click:reveal')));

	// connect actors
	events.plug(
		arrayFlatMap(
			[dom, firebase, storage, url],
			actor => actor(changes)
		)
	);

	// initial state
	changes.plug(Kefir.constant({
		firebase: data.firebase
	}));
};
