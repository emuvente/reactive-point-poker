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
import 'firebase/auth';
import 'firebase/database';
import Firebase from 'firebase/app';

// create an event stream from a Firebase Snapshot
const snapToEvent$ = stream => stream.map(snap => ({ [`change:${snap.key}`]: snap.val() })).skipDuplicates(isEqual);

// actor function export
export default changes => {
	let roomRef, userRef, refs = [];

	// init Firebase
	const app$ = event$(changes, 'firebase')
		.filter(isObject)
		.map(config => Firebase.initializeApp(config))
		.filter();

	// init auth
	const auth$ = app$.map(app => app.auth());
	const authUser$ = auth$.flatMap(auth => Kefir.stream(e => auth.onAuthStateChanged(e.emit)));

	// sign in user if they aren't
	auth$.sampledBy(authUser$.filter(isNull)).observe(auth => auth.signInAnonymously());

	// init updates
	event$(changes, 'is_editor').filter(isBoolean).observe(is_editor => userRef && userRef.update({is_editor}));
	event$(changes, 'is_voter').filter(isBoolean).observe(is_voter => userRef && userRef.update({is_voter}));
	event$(changes, 'show_votes').filter(isBoolean).observe(show_votes => roomRef && roomRef.update({show_votes}));
	event$(changes, 'votes').filter(isArray).observe(votes => roomRef && roomRef.update({votes}));
	event$(changes, 'vote').filter(isString).observe(vote => userRef && userRef.update({vote}));

	// clear votes transaction
	event$(changes, 'clear_votes').filter().observe(() => roomRef &&
		roomRef.child('users').transaction(users =>
			mapValues(users, user =>
				set(user, 'vote', '')
			)
		)
	);

	// init room
	const room$ = app$.map(app => app.database().ref())
		.combine(event$(changes, 'room').filter().skipDuplicates(),
			(db, roomName) => db.child(roomName)
		).filter();

	// init user
	const user$ = Kefir.combine([room$, authUser$.filter().map(v => v.uid)], (room, userId) => room.child(`users/${userId}`));

	// handle special cases
	Kefir.combine([user$.filter(), event$(changes, 'name').filter(isString)]).onValue(([user, name]) => user.update({name}));
	Kefir.combine([user$.filter(), event$(changes, 'is_voter').filter(isBoolean)]).onValue(([user, is_voter]) => user.update({is_voter}));
	Kefir.combine([user$.filter(), event$(changes, 'is_editor').filter(isBoolean)]).onValue(([user, is_editor]) => user.update({is_editor}));

	return Kefir.combine([room$, user$])
		.flatMap(([room, user]) => {
			// drop references to old room and update room reference
			if(roomRef) roomRef.off();
			roomRef = room;

			// remove user from old room and update user reference
			if(userRef) userRef.remove();
			userRef = user;
			user.onDisconnect().remove();

			// drop old references
			refs.map(ref => ref.off());

			// make new references
			refs = [
				room.child('show_votes'),
				room.child('votes'),
				user.child('vote'),
				room.child('users')
			];

			// recover user if they somehow go null
			Kefir.fromEvents(user, 'value')
				.map(snap => snap.val())
				.filter()
				.sampledBy(
					Kefir.fromEvents(user, 'value')
						.map(snap => snap.val())
						.filter(isNull)
						.map(()=>true)
				).observe(userVal => user.update(userVal));

			// transaction to merge changes to topic
			Kefir.combine([
				Kefir.merge([event$(changes, 'topic'), Kefir.constant('')]),
				Kefir.fromEvents(room.child('topic'), 'value')
					.map(snap => snap.val())
					.map(val => val === null ? '' : val)
					.map(val => val.split(':'))
					.map(([, ...topics]) => topics.join(':')),
			]).sampledBy(event$(changes, 'topic').filter(isString))
				.observe(([value, local]) => room.child('topic').transaction(remote => {
					remote = remote === null ? '' : remote.split(':')[1];
					return `${user.key}:${textMerge(local, value, remote)}`;
				}));

			// make topic stream
			const topic$ = Kefir.fromEvents(room.child('topic'), 'value')
				.map(snap => snap.val())
				.map(val => val === null ? '' : val)
				.map(val => val.split(':'))
				.map(([uid, ...topics]) => ({uid, value:topics.join(':')}));

			// return new streams
			return Kefir.merge([
				// Convert snapshots of references to change streams
				snapToEvent$(arrayFlatMap(refs, ref => Kefir.fromEvents(ref, 'value'))),
				// Topic events; 'change' if notfrom this user and 'report' if from this user
				topic$.filter(topic => topic.uid !== user.key).map(topic => ({'change:topic': topic.value})),
				topic$.filter(topic => topic.uid === user.key).map(topic => ({'report:topic': topic.value}))
			]);
		});
};
