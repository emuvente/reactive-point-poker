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
import arrayFlatMap from '../lib/arrayFlatMap';
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
	off,
	onValue,
	onDisconnect,
	runTransaction
} from 'firebase/database';

// create a stream of snapshots from a Firebase reference's value events
const value$ = ref => Kefir.stream(e => onValue(ref, e.emit));

// create an event stream from a Firebase Snapshot
const snapToEvent$ = stream => stream.map(snap => ({ [`change:${snap.key}`]: snap.val() })).skipDuplicates(isEqual);

// actor function export
export default changes => {
	let roomRef, userRef, refs = [];

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

	// sign in user if they aren't
	auth$.sampledBy(authUser$.filter(isNull)).observe(auth => signInAnonymously(auth));

	// init updates
	event$(changes, 'is_editor').filter(isBoolean).observe(is_editor => userRef && update(userRef, {is_editor}));
	event$(changes, 'is_voter').filter(isBoolean).observe(is_voter => userRef && update(userRef, {is_voter}));
	event$(changes, 'show_votes').filter(isBoolean).observe(show_votes => roomRef && update(roomRef, {show_votes}));
	event$(changes, 'votes').filter(isArray).observe(votes => roomRef && update(roomRef, {votes}));
	event$(changes, 'vote').filter(isString).observe(vote => userRef && update(userRef, {vote}));

	// clear votes transaction
	event$(changes, 'clear_votes').filter().observe(() => roomRef &&
		runTransaction(child(roomRef, 'users'), users =>
			mapValues(users, user =>
				set(user, 'vote', '')
			)
		)
	);

	// init room
	const room$ = app$.map(app => dbRef(getDatabase(app)))
		.combine(event$(changes, 'room').filter().skipDuplicates(),
			(db, roomName) => child(db, roomName)
		).filter();

	// init user
	const user$ = Kefir.combine([room$, authUser$.filter().map(v => v.uid)], (room, userId) => child(room, `users/${userId}`));

	// handle special cases
	Kefir.combine([user$.filter(), event$(changes, 'name').filter(isString)]).onValue(([user, name]) => update(user, {name}));
	Kefir.combine([user$.filter(), event$(changes, 'is_voter').filter(isBoolean)]).onValue(([user, is_voter]) => update(user, {is_voter}));
	Kefir.combine([user$.filter(), event$(changes, 'is_editor').filter(isBoolean)]).onValue(([user, is_editor]) => update(user, {is_editor}));

	return Kefir.combine([room$, user$])
		.flatMap(([room, user]) => {
			// drop references to old room and update room reference
			if(roomRef) off(roomRef);
			roomRef = room;

			// remove user from old room and update user reference
			if(userRef) remove(userRef);
			userRef = user;
			onDisconnect(user).remove();

			// drop old references
			refs.map(ref => off(ref));

			// make new references
			refs = [
				child(room, 'show_votes'),
				child(room, 'votes'),
				child(user, 'vote'),
				child(room, 'users')
			];

			// recover user if they somehow go null
			value$(user)
				.map(snap => snap.val())
				.filter()
				.sampledBy(
					value$(user)
						.map(snap => snap.val())
						.filter(isNull)
						.map(()=>true)
				).observe(userVal => update(user, userVal));

			// transaction to merge changes to topic
			Kefir.combine([
				Kefir.merge([event$(changes, 'topic'), Kefir.constant('')]),
				value$(child(room, 'topic'))
					.map(snap => snap.val())
					.map(val => val === null ? '' : val)
					.map(val => val.split(':'))
					.map(([, ...topics]) => topics.join(':')),
			]).sampledBy(event$(changes, 'topic').filter(isString))
				.observe(([value, local]) => runTransaction(child(room, 'topic'), remote => {
					remote = remote === null ? '' : remote.split(':')[1];
					return `${user.key}:${textMerge(local, value, remote)}`;
				}));

			// make topic stream
			const topic$ = value$(child(room, 'topic'))
				.map(snap => snap.val())
				.map(val => val === null ? '' : val)
				.map(val => val.split(':'))
				.map(([uid, ...topics]) => ({uid, value:topics.join(':')}));

			// return new streams
			return Kefir.merge([
				// Convert snapshots of references to change streams
				snapToEvent$(arrayFlatMap(refs, value$)),
				// Topic events; 'change' if not from this user and 'report' if from this user
				topic$.filter(topic => topic.uid !== user.key).map(topic => ({'change:topic': topic.value})),
				topic$.filter(topic => topic.uid === user.key).map(topic => ({'report:topic': topic.value}))
			]);
		});
};
