// import lodash functions
import isArray from 'lodash/isArray';
import isBoolean from 'lodash/isBoolean';
import isEqual from 'lodash/isEqual';
import isNull from 'lodash/isNull';
import isObject from 'lodash/isObject';
import isString from 'lodash/isString';
import mapValues from 'lodash/mapValues';
import set from 'lodash/set';

// other imports
import event$ from '../lib/event$';
import textMerge from '../lib/textMerge';
import Kefir from 'kefir';

// init Firebase library
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
	getDatabase,
	connectDatabaseEmulator,
	ref as dbRef,
	child,
	update,
	remove,
	onValue,
	onDisconnect,
	runTransaction
} from 'firebase/database';

// create a stream of snapshots from a Firebase reference's value events
const snapshot$ = ref => Kefir.stream(e => onValue(ref, e.emit));

// create a stream of values from a Firebase reference's value events
const value$ = ref => snapshot$(ref).map(snap => snap.val());

// create an event stream from a Firebase Snapshot
const snapshotToEvent$ = stream => stream.map(snap => ({ [`change:${snap.key}`]: snap.val() })).skipDuplicates(isEqual);

// split a stored topic into the id of the user who wrote it and its text
const parseTopic = val => {
	const [uid, ...topics] = (val === null ? '' : val).split(':');
	return {uid, value: topics.join(':')};
};

// call fn with the latest reference and each input value
const onRefInput = (ref$, input$, fn) => Kefir.combine([input$], [ref$]).observe(([input, ref]) => fn(ref, input));

// actor function export
export default changes => {
	// init Firebase
	const app$ = event$(changes, 'firebase')
		.filter(isObject)
		.map(config => {
			const app = initializeApp(config);
			if(import.meta.env.DEV) {
				connectAuthEmulator(getAuth(app), `http://${location.hostname}:9099`);
				connectDatabaseEmulator(getDatabase(app), location.hostname, 9000);
			}
			return app;
		})
		.filter();

	// init auth
	const auth$ = app$.map(app => getAuth(app));
	const authUser$ = auth$.flatMap(auth => Kefir.stream(e => onAuthStateChanged(auth, e.emit)));
	const uid$ = authUser$.filter().map(v => v.uid);

	// sign in user if they aren't
	auth$.sampledBy(authUser$.filter(isNull)).observe(auth => signInAnonymously(auth));

	// init session as the room reference and the user's reference in that room
	const session$ = Kefir.combine([
		app$.map(app => dbRef(getDatabase(app))),
		event$(changes, 'room').filter().skipDuplicates(),
		uid$
	], (db, roomName, uid) => {
		const room = child(db, roomName);
		return {room, user: child(room, `users/${uid}`)};
	});
	const room$ = session$.map(({room}) => room);
	const user$ = session$.map(({user}) => user);

	// remove the previous user, remove the next user on disconnect, and restore the next user's last value when it goes null
	user$.diff((prev, next) => [prev, next], null)
		.flatMapLatest(([prev, next]) => {
			if(prev) remove(prev);
			onDisconnect(next).remove();
			return value$(next)
				.filter()
				.sampledBy(value$(next).filter(isNull))
				.map(userVal => [next, userVal]);
		})
		.observe(([user, userVal]) => update(user, userVal));

	// write name, is_voter, and is_editor to the user when any of them or the user changes
	const profile$ = Kefir.merge([
		event$(changes, 'name').filter(isString).map(name => ({name})),
		event$(changes, 'is_voter').filter(isBoolean).map(is_voter => ({is_voter})),
		event$(changes, 'is_editor').filter(isBoolean).map(is_editor => ({is_editor}))
	]).scan((profile, change) => ({...profile, ...change}));
	Kefir.combine([user$, profile$]).observe(([user, profile]) => update(user, profile));

	// write vote to the user and show_votes and votes to the room
	onRefInput(user$, event$(changes, 'vote').filter(isString), (user, vote) => update(user, {vote}));
	onRefInput(room$, event$(changes, 'show_votes').filter(isBoolean), (room, show_votes) => update(room, {show_votes}));
	onRefInput(room$, event$(changes, 'votes').filter(isArray), (room, votes) => update(room, {votes}));

	// clear votes transaction
	onRefInput(room$, event$(changes, 'clear_votes').filter(), room =>
		runTransaction(child(room, 'users'), users =>
			mapValues(users, user =>
				set(user, 'vote', '')
			)
		)
	);

	// transaction to merge changes to topic
	session$.flatMapLatest(({room, user}) => {
		const topicRef = child(room, 'topic');
		return Kefir.combine(
			[event$(changes, 'topic').filter(isString)],
			[value$(topicRef).map(parseTopic)],
			(value, base) => ({topicRef, user, value, base: base.value})
		);
	}).observe(({topicRef, user, value, base}) => runTransaction(topicRef, remote => {
		remote = remote === null ? '' : remote.split(':')[1];
		return `${user.key}:${textMerge(base, value, remote)}`;
	}));

	// Convert snapshots of the session's references to change streams
	const state$ = session$.flatMapLatest(({room, user}) => snapshotToEvent$(Kefir.merge([
		snapshot$(child(room, 'show_votes')),
		snapshot$(child(room, 'votes')),
		snapshot$(child(user, 'vote')),
		snapshot$(child(room, 'users'))
	])));

	// make topic stream
	const topic$ = session$.flatMapLatest(({room, user}) =>
		value$(child(room, 'topic'))
			.map(parseTopic)
			.map(({uid, value}) => ({mine: uid === user.key, value}))
	);

	return Kefir.merge([
		state$,
		// Topic events; 'change' if not from this user and 'report' if from this user
		topic$.filter(topic => !topic.mine).map(topic => ({'change:topic': topic.value})),
		topic$.filter(topic => topic.mine).map(topic => ({'report:topic': topic.value}))
	]);
};
